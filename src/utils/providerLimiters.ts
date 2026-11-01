import Bottleneck from 'bottleneck';
import { createRedisClientFromEnv, type RedisClient } from './redisCluster.js';
import { logger } from './logger.js';

export type ProviderName = 'twitch' | 'youtube' | 'github' | 'libretranslate' | 'openai' | 'rss';

export interface ProviderLimiterSettings {
    maxConcurrent: number;
    minTimeMs: number;
    highWater: number;
}

export interface ProviderLimiterManagerOptions {
    redisEnabled?: boolean;
    settings?: Partial<Record<ProviderName, Partial<ProviderLimiterSettings>>>;
    redisFactory?: () => RedisClient;
}

const PROVIDERS: ProviderName[] = ['twitch', 'youtube', 'github', 'libretranslate', 'openai', 'rss'];
const DEFAULT_SETTINGS: Record<ProviderName, ProviderLimiterSettings> = {
    twitch: { maxConcurrent: 2, minTimeMs: 250, highWater: 100 },
    youtube: { maxConcurrent: 2, minTimeMs: 250, highWater: 100 },
    github: { maxConcurrent: 2, minTimeMs: 500, highWater: 100 },
    libretranslate: { maxConcurrent: 2, minTimeMs: 250, highWater: 100 },
    openai: { maxConcurrent: 2, minTimeMs: 100, highWater: 100 },
    rss: { maxConcurrent: 2, minTimeMs: 250, highWater: 100 }
};

const MAX_CONCURRENT = 100;
const MAX_MIN_TIME_MS = 60000;
const MAX_HIGH_WATER = 10000;

function parseBoundedInteger(name: string, value: string | undefined, fallback: number, maximum: number): number {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw new Error(`${name} must be an integer between 1 and ${maximum}`);
    }
    return parsed;
}

function envKey(provider: ProviderName, suffix: string): string {
    return `PROVIDER_LIMIT_${provider.toUpperCase()}_${suffix}`;
}

function readSettings(provider: ProviderName, overrides: Partial<ProviderLimiterSettings> | undefined): ProviderLimiterSettings {
    const defaults = DEFAULT_SETTINGS[provider];
    return {
        maxConcurrent: parseBoundedInteger(envKey(provider, 'MAX_CONCURRENT'), process.env[envKey(provider, 'MAX_CONCURRENT')], overrides?.maxConcurrent ?? defaults.maxConcurrent, MAX_CONCURRENT),
        minTimeMs: parseBoundedInteger(envKey(provider, 'MIN_TIME_MS'), process.env[envKey(provider, 'MIN_TIME_MS')], overrides?.minTimeMs ?? defaults.minTimeMs, MAX_MIN_TIME_MS),
        highWater: parseBoundedInteger(envKey(provider, 'HIGH_WATER'), process.env[envKey(provider, 'HIGH_WATER')], overrides?.highWater ?? defaults.highWater, MAX_HIGH_WATER)
    };
}

function isRedisEnabled(explicit: boolean | undefined): boolean {
    if (explicit !== undefined) {
        return explicit;
    }
    return process.env['PROVIDER_LIMITER_REDIS'] === 'true';
}

export class ProviderLimiterManager {
    private readonly settings: Record<ProviderName, ProviderLimiterSettings>;
    private readonly redisEnabled: boolean;
    private readonly redisFactory: () => RedisClient;
    private readonly limiters = new Map<string, Bottleneck>();
    private readonly limiterPromises = new Map<string, Promise<Bottleneck>>();
    private redis: RedisClient | null = null;
    private redisConnection: Bottleneck.IORedisConnection | null = null;
    private redisReady: Promise<boolean> | null = null;

    constructor(options: ProviderLimiterManagerOptions = {}) {
        this.redisEnabled = isRedisEnabled(options.redisEnabled);
        this.redisFactory = options.redisFactory ?? createRedisClientFromEnv;
        this.settings = Object.fromEntries(PROVIDERS.map(provider => [
            provider,
            readSettings(provider, options.settings?.[provider])
        ])) as Record<ProviderName, ProviderLimiterSettings>;
    }

    getSettings(provider: ProviderName): ProviderLimiterSettings {
        return { ...this.settings[provider] };
    }

    async schedule<T>(provider: ProviderName, task: () => Promise<T>, key?: string): Promise<T> {
        const limiter = await this.getLimiter(provider, key);
        return limiter.schedule(task);
    }

    async shutdown(): Promise<void> {
        const limiters = [...this.limiters.values()];
        this.limiters.clear();
        this.limiterPromises.clear();
        await Promise.all(limiters.map(limiter => limiter.stop({ dropWaitingJobs: true })));
        await this.redisConnection?.disconnect();
        await this.redis?.quit();
        this.redisConnection = null;
        this.redis = null;
        this.redisReady = null;
    }

    private async getLimiter(provider: ProviderName, key?: string): Promise<Bottleneck> {
        const limiterKey = `${provider}:${provider === 'rss' && key ? key : 'global'}`;
        const existing = this.limiters.get(limiterKey);
        if (existing) {
            return existing;
        }

        const pending = this.limiterPromises.get(limiterKey);
        if (pending) {
            return pending;
        }

        const creation = this.createLimiter(provider, limiterKey);
        this.limiterPromises.set(limiterKey, creation);
        return creation;
    }

    private async createLimiter(provider: ProviderName, limiterKey: string): Promise<Bottleneck> {
        const settings = this.settings[provider];
        const connection = await this.getRedisConnection();
        const limiter = new Bottleneck({
            id: `apollo-provider-${limiterKey}`,
            maxConcurrent: settings.maxConcurrent,
            minTime: settings.minTimeMs,
            highWater: settings.highWater,
            strategy: Bottleneck.strategy.LEAK,
            ...(connection ? { connection } : {})
        });
        limiter.on('dropped', () => {
            logger.warn({ provider, msg: '[PROVIDER_LIMITER] queued request dropped' });
        });
        limiter.on('failed', (error, info) => {
            logger.debug({ provider, retryCount: info.retryCount, msg: '[PROVIDER_LIMITER] request failed' });
            const retryAfterMs = error instanceof Error
                ? (error as Error & { retryAfterMs?: number }).retryAfterMs
                : undefined;
            if (info.retryCount === 0 && retryAfterMs && retryAfterMs > 0) {
                return retryAfterMs;
            }
            return undefined;
        });
        this.limiters.set(limiterKey, limiter);
        this.limiterPromises.delete(limiterKey);
        return limiter;
    }

    private async getRedisConnection(): Promise<Bottleneck.IORedisConnection | null> {
        if (!this.redisEnabled) {
            return null;
        }
        if (!this.redisReady) {
            this.redisReady = this.initializeRedis();
        }
        const ready = await this.redisReady;
        return ready ? this.redisConnection : null;
    }

    private async initializeRedis(): Promise<boolean> {
        try {
            const redis = this.redisFactory();
            await redis.ping();
            this.redis = redis;
            this.redisConnection = new Bottleneck.IORedisConnection({ client: redis });
            await this.redisConnection.ready();
            return true;
        } catch (error) {
            logger.warn({ err: error as Error, msg: '[PROVIDER_LIMITER] Redis unavailable; using local limits' });
            await this.redis?.quit().catch(() => undefined);
            this.redis = null;
            this.redisConnection = null;
            return false;
        }
    }
}

export const providerLimiters = new ProviderLimiterManager();

export function scheduleWithProviderLimit<T>(
    provider: ProviderName,
    task: () => Promise<T>,
    key?: string
): Promise<T> {
    return providerLimiters.schedule(provider, task, key);
}

export async function shutdownProviderLimiters(): Promise<void> {
    await providerLimiters.shutdown();
}
