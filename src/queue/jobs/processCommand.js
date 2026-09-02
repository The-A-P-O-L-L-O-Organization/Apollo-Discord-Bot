import { REST } from '@discordjs/rest';
import { Collection } from 'discord.js';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/config.js';
import RemoteInteraction from '../remoteInteraction.js';
import { serializeInteraction, serializeForQueue } from '../serializeInteraction.js';
import { registerHandler } from '../jobHandler.js';
import { createQueue } from '../queue.js';
import { recordCommand, recordCommandDuration, recordError } from '../../utils/metrics.js';
import { logger } from '../../utils/logger.js';
import { encode, decode } from 'msgpackr';

export const JobNames = {
    PROCESS_COMMAND: 'process-command'
};

let rest = null;

// Command module cache to avoid re-importing on every job
export const commandModuleCache = new Map();

// Nonce store for HMAC replay protection (Redis-backed in production)
const nonceStore = new Map(); // In-memory fallback for dev; replace with Redis SET in production

function getRest() {
    if (!rest) {
        rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    }
    return rest;
}

function signJobData(payload) {
    const secret = config.queue.hmacSecret;
    if (!secret) {
        return { ...payload, _hmacUnsigned: true };
    }
    const timestamp = Date.now();
    const nonce = randomBytes(16).toString('hex');
    const signable = encode({ ...payload, timestamp, nonce });
    const hmac = createHmac('sha256', secret).update(signable).digest('hex');
    return { ...payload, timestamp, nonce, hmac };
}

function verifyJobData(payload) {
    const secret = config.queue.hmacSecret;
    if (!secret) {
        // Backward compat: accept unsigned jobs in dev, warn
        if (process.env.NODE_ENV !== 'production') {
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
    if (now - timestamp > 5 * 60 * 1000) {
        logger.warn('[HMAC] Job timestamp expired — rejecting job');
        return false;
    }

    // Verify HMAC
    const signable = encode({ ...rest, timestamp, nonce });
    const expectedHmac = createHmac('sha256', secret).update(signable).digest('hex');
    const payloadHmacBuffer = Buffer.from(hmac, 'hex');
    const expectedHmacBuffer = Buffer.from(expectedHmac, 'hex');
    if (payloadHmacBuffer.length !== expectedHmacBuffer.length || !timingSafeEqual(payloadHmacBuffer, expectedHmacBuffer)) {
        logger.warn('[HMAC] HMAC mismatch — rejecting job');
        return false;
    }

    // Nonce deduplication (in-memory; for production use Redis SET with TTL)
    const nonceKey = `${nonce}:${timestamp}`;
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

export async function enqueueCommand(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {return null;}

    const data = serializeInteraction(interaction);
    data.pluginId = command.pluginId || null;

    // Sign job data with HMAC
    const signedData = signJobData(data);

    const queue = await createQueue(config.queue.prefix);
    const job = await queue.add(JobNames.PROCESS_COMMAND, signedData, {
        jobId: interaction.id,
        deduplication: { id: interaction.id, ttl: 300000 }
    });

    return job;
}

export default function register() {
    registerHandler(JobNames.PROCESS_COMMAND, async(job) => {
        const data = job.data;
        
        // Verify HMAC signature
        if (!verifyJobData(data)) {
            logger.warn('[Worker] Job HMAC verification failed — rejecting');
            return { status: 'error', reason: 'hmac_verification_failed' };
        }

        logger.info(`[Worker] Processing /${data.commandName} in guild ${data.guildId}`);

        const r = getRest();

        const interaction = new RemoteInteraction(data, r, {
            commands: new Collection(),
            config: {
                ...config,
                CLIENT_ID: config.CLIENT_ID
            }
        });

        const startTime = Date.now();
        try {
            const commandModule = await importCommandModule(data.commandName, data.pluginId);
            if (!commandModule) {
                await interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: 'Error',
                        description: `Command \`/${data.commandName}\` not found on worker.`
                    }]
                });
                recordCommand(data.commandName, data.guildId, 'not_found');
                return { status: 'error', reason: 'command_not_found' };
            }

            if (typeof commandModule.execute !== 'function') {
                await interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: 'Error',
                        description: `Command \`/${data.commandName}\` has invalid execute method.`
                    }]
                });
                recordCommand(data.commandName, data.guildId, 'invalid');
                return { status: 'error', reason: 'invalid_command' };
            }

            await commandModule.execute(interaction);

            logger.info(`[Worker] /${data.commandName} completed`);
            recordCommand(data.commandName, data.guildId, 'success');
            recordCommandDuration(data.commandName, Date.now() - startTime);
            return { status: 'completed', commandName: data.commandName };
        } catch (error) {
            logger.error(`[Worker] Error executing /${data.commandName}:`, error.message);

            const errorEmbed = {
                color: 0xFF0000,
                title: 'Error',
                description: 'An error occurred while executing this command.',
                fields: [{ name: 'Error', value: error.message || 'Unknown error' }],
                timestamp: new Date().toISOString()
            };

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (e) {
                logger.error('[Worker] Failed to send error response:', e.message);
            }

            recordCommand(data.commandName, data.guildId, 'error');
            recordError('command_execution', data.commandName);
            return { status: 'error', error: error.message };
        }
    });
}

async function importCommandModule(commandName, pluginId) {
    const cacheKey = `${pluginId || 'global'}:${commandName}`;
    if (commandModuleCache.has(cacheKey)) {
        return commandModuleCache.get(cacheKey);
    }

    const cwd = process.cwd();
    const baseDirs = [
        pluginId ? path.join(cwd, 'src/plugins', pluginId) : null,
        pluginId ? path.join(cwd, 'data/plugins', pluginId) : null
    ].filter(Boolean);

    for (const baseDir of baseDirs) {
        const cmdPath = path.join(baseDir, 'commands', `${commandName}.js`);
        if (existsSync(cmdPath)) {
            try {
                const url = pathToFileURL(cmdPath);
                // Remove cache-busting in production
                if (process.env.NODE_ENV === 'development') {
                    url.searchParams.set('t', Date.now().toString());
                }
                const mod = await import(url.href);
                if (mod?.default?.execute) {
                    commandModuleCache.set(cacheKey, mod.default);
                    return mod.default;
                }
            } catch (err) {
                logger.error(`[Worker] Failed to import ${cmdPath}:`, err.message);
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
                    if (process.env.NODE_ENV === 'development') {
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
