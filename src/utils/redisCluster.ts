import Redis from 'ioredis';
import type { RedisOptions, ClusterOptions, ClusterNode, Redis as RedisType, Cluster as ClusterType, SentinelAddress } from 'ioredis';
import { logger } from './logger.js';

export type RedisClient = RedisType | ClusterType;

const _Redis = Redis as unknown as new (options?: RedisOptions) => RedisType;
const _Cluster = (Redis as unknown as { Cluster: new (nodes: ClusterNode[], options?: ClusterOptions) => ClusterType }).Cluster;

export interface RedisConnectionConfig {
    mode: 'standalone' | 'sentinel' | 'cluster';
    urls?: string[];
    sentinelUrls?: string[];
    sentinelName?: string;
    url?: string;
    options?: RedisOptions;
}

function parseClusterNodes(urls: string[]): ClusterNode[] {
    return urls.map((url) => {
        const u = new URL(url);
        return { host: u.hostname, port: parseInt(u.port || '6379', 10) };
    });
}

function parseSentinelNodes(urls: string[]): Partial<SentinelAddress>[] {
    return urls.map((url) => {
        const u = new URL(url);
        return { host: u.hostname, port: parseInt(u.port || '26379', 10) };
    });
}

function defaultRetryStrategy(times: number): number | null {
    return times > 10 ? null : Math.min(times * 100, 3000);
}

export function createRedisClient(config: RedisConnectionConfig): RedisClient {
    const baseOptions: RedisOptions = {
        protocol: 2,
        maxRetriesPerRequest: config.options?.maxRetriesPerRequest ?? 3,
        retryStrategy: config.options?.retryStrategy ?? defaultRetryStrategy,
        lazyConnect: config.options?.lazyConnect ?? true,
        enableReadyCheck: true,
        ...config.options
    };

    switch (config.mode) {
    case 'cluster': {
        if (!config.urls || config.urls.length === 0) {
            throw new Error('REDIS_CLUSTER_URLS required for cluster mode');
        }
        const clusterOptions: ClusterOptions = {
            ...baseOptions,
            scaleReads: 'slave',
            maxRedirections: 16,
            clusterRetryStrategy: (times: number) => Math.min(times * 100, 3000)
        };
        const cluster = new _Cluster(parseClusterNodes(config.urls), clusterOptions);
        cluster.on('error', (err: Error) => {
            logger.error({ err, msg: '[REDIS:cluster] Connection error' });
        });
        cluster.on('connect', () => {
            logger.info('[REDIS:cluster] Connected');
        });
        cluster.on('ready', () => {
            logger.info('[REDIS:cluster] Ready');
        });
        cluster.on('close', () => {
            logger.info('[REDIS:cluster] Connection closed');
        });
        return cluster;
    }

    case 'sentinel': {
        if (!config.sentinelUrls || config.sentinelUrls.length === 0) {
            throw new Error('REDIS_SENTINEL_URLS required for sentinel mode');
        }
        const sentinel = new _Redis({
            ...baseOptions,
            sentinels: parseSentinelNodes(config.sentinelUrls),
            name: config.sentinelName ?? 'mymaster',
            role: 'master',
            sentinelRetryStrategy: (times: number) => Math.min(times * 100, 3000)
        });
        sentinel.on('error', (err: Error) => {
            logger.error({ err, msg: '[REDIS:sentinel] Connection error' });
        });
        sentinel.on('connect', () => {
            logger.info('[REDIS:sentinel] Connected');
        });
        sentinel.on('ready', () => {
            logger.info('[REDIS:sentinel] Ready');
        });
        sentinel.on('close', () => {
            logger.info('[REDIS:sentinel] Connection closed');
        });
        return sentinel;
    }

    case 'standalone':
    default: {
        const url = config.url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';
        const standaloneOptions = { ...baseOptions, url };
        const standalone = new _Redis(standaloneOptions);
        standalone.on('error', (err: Error) => {
            logger.error({ err, msg: '[REDIS:standalone] Connection error' });
        });
        standalone.on('connect', () => {
            logger.info('[REDIS:standalone] Connected');
        });
        standalone.on('ready', () => {
            logger.info('[REDIS:standalone] Ready');
        });
        standalone.on('close', () => {
            logger.info('[REDIS:standalone] Connection closed');
        });
        return standalone;
    }
    }
}

export function createRedisClientFromEnv(): RedisClient {
    const mode = (process.env['REDIS_MODE'] as 'standalone' | 'sentinel' | 'cluster') || 'standalone';

    if (mode === 'cluster') {
        return createRedisClient({
            mode: 'cluster',
            urls: process.env['REDIS_CLUSTER_URLS']?.split(',') ?? []
        });
    }

    if (mode === 'sentinel') {
        return createRedisClient({
            mode: 'sentinel',
            sentinelUrls: process.env['REDIS_SENTINEL_URLS']?.split(',') ?? [],
            sentinelName: process.env['REDIS_SENTINEL_NAME']
        });
    }

    return createRedisClient({ mode: 'standalone' });
}