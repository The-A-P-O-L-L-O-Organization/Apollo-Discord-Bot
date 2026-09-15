import { ShardingManager, type Shard } from 'discord.js';
import { config } from './config/config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger({ component: 'ShardManager' });

const shardingEnabled = (process.env['ENABLE_SHARDING'] ?? '') === 'true';
const totalShards = process.env['SHARD_COUNT'] === 'auto' || process.env['SHARD_COUNT'] === undefined
    ? 'auto'
    : Number.parseInt(process.env['SHARD_COUNT'] ?? '', 10);

if (!shardingEnabled) {
    logger.error('Sharding is disabled. Set ENABLE_SHARDING=true to enable.');
    process.exit(1);
}

if (typeof totalShards === 'number' && !Number.isFinite(totalShards)) {
    logger.error('Invalid SHARD_COUNT. Set SHARD_COUNT=auto or a positive integer.');
    process.exit(1);
}

const shardFile = new URL('./index.js', import.meta.url).pathname;

const manager = new ShardingManager(shardFile, {
    token: config.discord.token,
    totalShards,
    shardArgs: ['--shard'],
    mode: 'process',
    respawn: true,
    execArgv: process.execArgv.filter((arg) => !arg.startsWith('--inspect'))
});

manager.on('shardCreate', (shard: Shard) => {
    logger.info(`[ShardManager] Launched shard ${shard.id}`);

    shard.on('disconnect', () => {
        logger.warn(`[ShardManager] Shard ${shard.id} disconnected`);
    });

    shard.on('error', (error: Error) => {
        logger.error({ err: error }, `[ShardManager] Shard ${shard.id} encountered an error`);
    });

    shard.on('ready', () => {
        logger.info(`[ShardManager] Shard ${shard.id} connected to Discord`);
    });
});

async function shutdownShards(signal: string): Promise<void> {
    logger.info(`[ShardManager] Received ${signal}, initiating graceful shutdown...`);
    try {
        await manager.broadcastEval((_context) => process.exit(0));
        logger.info('[ShardManager] All shards exited');
    } catch (error) {
        logger.error({ err: error as Error }, '[ShardManager] Error during broadcastEval');
    } finally {
        process.exit(0);
    }
}

process.on('SIGTERM', () => {
    void shutdownShards('SIGTERM');
});
process.on('SIGINT', () => {
    void shutdownShards('SIGINT');
});

manager.spawn().then(() => {
    logger.info('[ShardManager] Shards spawned');
}).catch((error: unknown) => {
    logger.error({ err: error as Error }, '[ShardManager] Failed to spawn shards');
    process.exit(1);
});
