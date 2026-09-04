// Process Command Job - TypeScript migration
// Handles command processing in worker mode with HMAC verification

import { REST } from '@discordjs/rest';
import { Collection } from 'discord.js';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/config.js';
import RemoteInteraction from '../remoteInteraction.js';
import { serializeInteraction } from '../serializeInteraction.js';
import { registerHandler } from '../jobHandler.js';
import { createQueue } from '../queue.js';
import { recordCommand, recordCommandDuration, recordError } from '../../utils/metrics.js';
import { logger } from '../../utils/logger.js';
import { encode } from 'msgpackr';
import type { Job } from 'bullmq';

export const JobNames = {
    PROCESS_COMMAND: 'process-command'
} as const;

let rest: REST | null = null;

// Command module cache to avoid re-importing on every job
export const commandModuleCache = new Map<string, { execute: (_interaction: unknown) => Promise<unknown> }>();

// Nonce store for HMAC replay protection (Redis-backed in production)
const nonceStore = new Map<string, number>(); // In-memory fallback for dev; replace with Redis SET in production

function getRest(): REST {
    if (!rest) {
        rest = new REST({ version: '10' }).setToken(config.discord.token);
    }
    return rest;
}

function signJobData(payload: Record<string, unknown>): Record<string, unknown> {
    const secret = (config.queue as Record<string, unknown>)['hmacSecret'] as string | undefined;
    if (!secret) {
        return { ...payload, _hmacUnsigned: true };
    }
    const timestamp = Date.now();
    const nonce = randomBytes(16).toString('hex');
    const signable = encode({ ...payload, timestamp, nonce });
    const hmac = createHmac('sha256', secret).update(signable).digest('hex');
    return { ...payload, timestamp, nonce, hmac };
}

function verifyJobData(payload: Record<string, unknown>): boolean {
    const secret = (config.queue as Record<string, unknown>)['hmacSecret'] as string | undefined;
    if (!secret) {
        // Backward compat: accept unsigned jobs in dev, warn
        if (process.env['NODE_ENV'] !== 'production') {
            logger.warn('[HMAC] QUEUE_HMAC_SECRET not set — accepting unsigned job (dev mode)');
        }
        return true;
    }

    const { hmac, timestamp, nonce, ...rest } = payload;
    if (!hmac || !timestamp || !nonce) {
        logger.warn('[HMAC] Missing HMAC fields — rejecting job');
        return false;
    }

    // Check timestamp window (5 minutes)
    const now = Date.now();
    if (now - Number(timestamp) > 5 * 60 * 1000) {
        logger.warn('[HMAC] Job timestamp expired — rejecting job');
        return false;
    }

    // Verify HMAC
    const signable = encode({ ...rest, timestamp, nonce });
    const expectedHmac = createHmac('sha256', secret).update(signable).digest('hex');
    const payloadHmacBuffer = Buffer.from(hmac as string, 'hex');
    const expectedHmacBuffer = Buffer.from(expectedHmac, 'hex');
    if (payloadHmacBuffer.length !== expectedHmacBuffer.length || !timingSafeEqual(payloadHmacBuffer, expectedHmacBuffer)) {
        logger.warn('[HMAC] HMAC mismatch — rejecting job');
        return false;
    }

    // Nonce deduplication (in-memory; for production use Redis SET with TTL)
    const nonceKey = `${String(nonce)}:${String(timestamp)}`;
    if (nonceStore.has(nonceKey)) {
        logger.warn('[HMAC] Duplicate nonce — rejecting job');
        return false;
    }
    nonceStore.set(nonceKey, now);
    // Cleanup old nonces (older than 10 minutes)
    for (const [key, ts] of nonceStore.entries()) {
        if (now - ts > 10 * 60 * 1000) {
            nonceStore.delete(key);
        }
    }

    return true;
}

export async function enqueueCommand(_interaction: {
    client: { commands: Map<string, { pluginId?: string; execute: (_interaction: unknown) => Promise<unknown> }> };
    commandName: string;
    id: string;
    token: string;
    commandId: string;
    createdTimestamp: number;
    guildId: string | null;
    channelId: string;
    user: { id: string };
    member?: { permissions?: { toArray?: () => string[] }; roles?: { cache?: Map<string, { id: string }> } };
    options: { data?: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[] };
}): Promise<{ id: string; name: string; data: unknown } | null> {
    const command = _interaction.client.commands.get(_interaction.commandName);
    if (!command) { return null; }

    const data = serializeInteraction(_interaction);
    // @ts-expect-error pluginId added to serialized interaction
    data.pluginId = command.pluginId ?? null;

    // Sign job data with HMAC
    const signedData = signJobData(data as unknown as Record<string, unknown>);

    const queue = await createQueue(config.queue.prefix);
    const job = await queue.add(JobNames.PROCESS_COMMAND, signedData, {
        jobId: _interaction.id,
        deduplication: { id: _interaction.id, ttl: 300000 }
    });

    return { id: job.id!, name: job.name, data: job.data };
}

export default function register(): void {
    // @ts-expect-error handler type mismatch due to transitional types
    registerHandler(JobNames.PROCESS_COMMAND, async (job: Job<Record<string, unknown>>) => {
        const data = job.data;

        // Verify HMAC signature
        if (!verifyJobData(data)) {
            logger.warn('[Worker] Job HMAC verification failed — rejecting');
            return { status: 'error', reason: 'hmac_verification_failed' };
        }

        logger.info(`[Worker] Processing /${String(data['commandName'])} in guild ${String(data['guildId'])}`);

        const r = getRest();

        const interaction = new RemoteInteraction(data, r, {
            commands: new Collection(),
            config: {
                ...config,
                CLIENT_ID: config.discord.clientId
            }
        });

        const startTime = Date.now();
        try {
            const commandModule = await importCommandModule(data['commandName'] as string, data['pluginId'] as string | null);
            if (!commandModule) {
                await interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: 'Error',
                        description: `\`/${String(data['commandName'])}\` not found on worker.`
                    }]
                });
                recordCommand(String(data['commandName']), String(data['guildId']), 'not_found');
                return { status: 'error', reason: 'command_not_found' };
            }

            if (typeof commandModule.execute !== 'function') {
                await interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: 'Error',
                        description: `\`/${String(data['commandName'])}\` has invalid execute method.`
                    }]
                });
                recordCommand(String(data['commandName']), String(data['guildId']), 'invalid');
                return { status: 'error', reason: 'invalid_command' };
            }

            await commandModule.execute(interaction);

            logger.info({ msg: `[Worker] /${String(data['commandName'])} completed` });
            recordCommand(String(data['commandName']), String(data['guildId'] ?? 'unknown'), 'success');
            recordCommandDuration(String(data['commandName']), Date.now() - startTime);
            return { status: 'completed', commandName: data['commandName'] };
        } catch (error) {
            logger.error({ err: error as Error, msg: `[Worker] Error executing /${String(data['commandName'])}` });

            const errorEmbed = {
                color: 0xFF0000,
                title: 'Error',
                description: 'An error occurred while executing this command.',
                fields: [{ name: 'Error', value: (error as Error).message ?? 'Unknown error' }],
                timestamp: new Date().toISOString()
            };

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (e) {
                logger.error({ err: e as Error, msg: '[Worker] Failed to send error response' });
            }

            recordCommand(String(data['commandName']), String(data['guildId'] ?? 'unknown'), 'error');
            recordError('command_execution', String(data['commandName']));
            return { status: 'error', error: (error as Error).message };
        }
    });
}

async function importCommandModule(commandName: string, pluginId: string | null): Promise<{ execute: (_interaction: unknown) => Promise<unknown> } | null> {
    const cacheKey = `${pluginId ?? 'global'}:${commandName}`;
    if (commandModuleCache.has(cacheKey)) {
        return commandModuleCache.get(cacheKey) ?? null;
    }

    const cwd = process.cwd();
    const baseDirs = [
        pluginId ? path.join(cwd, 'src/plugins', pluginId) : '',
        pluginId ? path.join(cwd, 'data/plugins', pluginId) : ''
    ].filter(Boolean);

    for (const baseDir of baseDirs) {
        const cmdPath = path.join(baseDir, 'commands', `${commandName}.js`);
        if (existsSync(cmdPath)) {
            try {
                const url = pathToFileURL(cmdPath);
                // Remove cache-busting in production
                if (process.env['NODE_ENV'] === 'development') {
                    url.searchParams.set('t', Date.now().toString());
                }
                const mod = await import(url.href);
                if (mod?.default?.execute) {
                    commandModuleCache.set(cacheKey, mod.default);
                    return mod.default;
                }
            } catch (err) {
                logger.error({ err: err as Error, msg: `[Worker] Failed to import ${cmdPath}` });
            }
        }
    }

    const srcPlugins = path.join(cwd, 'src/plugins');
    try {
        const { readdirSync } = await import('fs');
        const entries = readdirSync(srcPlugins);
        for (const entry of entries) {
            const cmdPath = path.join(srcPlugins, entry, 'commands', `${commandName}.js`);
            if (existsSync(cmdPath)) {
                try {
                    const url = pathToFileURL(cmdPath);
                    if (process.env['NODE_ENV'] === 'development') {
                        url.searchParams.set('t', Date.now().toString());
                    }
                    const mod = await import(url.href);
                    if (mod?.default?.execute) {
                        commandModuleCache.set(cacheKey, mod.default);
                        return mod.default;
                    }
                } catch {}
            }
        }
    } catch {}

    return null;
}