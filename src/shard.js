// ShardingManager Entry Point
// Spawns shard workers and manages cross-shard communication

import { ShardingManager } from 'discord.js';
import { config } from './config/config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger({ component: 'ShardManager' });

// Validate sharding configuration
if (!config.shard.enabled) {
    logger.error('Sharding is disabled. Set ENABLE_SHARDING=true to enable.');
    process.exit(1);
}

// ShardingManager options
const shardOptions = {
    token: config.DISCORD_TOKEN,
    totalShards: config.shard.count,
    shardArgs: ['--shard'], // Pass --shard flag to worker to indicate shard mode
    mode: 'process',
    respawn: true,
    execArgv: process.execArgv.filter(arg => !arg.startsWith('--inspect')) // Avoid port conflicts
};

// Create ShardingManager instance
const manager = new ShardingManager('./src/index.js', shardOptions);

// Handle shard creation
manager.on('shardCreate', (shard) => {
    logger.info(`[ShardManager] Launched shard ${shard.id}`);
});

// Handle shard disconnection
manager.on('shardDisconnect', (event, shard) => {
    logger.warn(`[ShardManager] Shard ${shard.id} disconnected: ${event.code}`, { event });
});

// Handle shard errors
manager.on('shardError', (error, shard) => {
    logger.error(`[ShardManager] Shard ${shard.id} encountered an error:`, error);
});

// Handle shard ready (when shard connects to Discord)
manager.on('shardReady', (shard) => {
    logger.info(`[ShardManager] Shard ${shard.id} connected to Discord`);
});

// Graceful shutdown
process.on('SIGTERM', async() => {
    logger.info('[ShardManager] Received SIGTERM, initiating graceful shutdown...');
    try {
        // Broadcast exit signal to all shards
        await manager.broadcastEval('process.exit(0)');
        logger.info('[ShardManager] All shards exited');
    } catch (error) {
        logger.error('[ShardManager] Error during broadcastEval:', error);
    } finally {
        process.exit(0);
    }
});

process.on('SIGINT', async() => {
    logger.info('[ShardManager] Received SIGINT, initiating graceful shutdown...');
    try {
        await manager.broadcastEval('process.exit(0)');
        logger.info('[ShardManager] All shards exited');
    } catch (error) {
        logger.error('[ShardManager] Error during broadcastEval:', error);
    } finally {
        process.exit(0);
    }
});

// Spawn shards
manager.spawn().then(() => {
    logger.info(`[ShardManager] Spawned ${manager.shardCount} shards`);
}).catch((error) => {
    logger.error('[ShardManager] Failed to spawn shards:', error);
    process.exit(1);
});