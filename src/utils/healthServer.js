// Health Check & Metrics Server
// Exposes /health, /ready, and /metrics endpoints for monitoring

import { createServer } from 'http';
import { register, recordGatewayLatency } from './metrics.js';
import { getLockRedis } from './lock.js';
import { getDb as getKnex } from '../db/knex.js';
import { config } from '../config/config.js';

let healthServer = null;
let isReady = false;
let startupTime = Date.now();

// Health check authentication token (optional)
const HEALTH_AUTH_TOKEN = process.env.HEALTH_AUTH_TOKEN || config.health?.authToken || null;

/**
 * Checks if request is authenticated
 * @param {IncomingMessage} req - HTTP request
 * @returns {boolean}
 */
function isAuthenticated(req) {
    if (!HEALTH_AUTH_TOKEN) {
        return true; // No auth configured, allow all
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return false;
    }
    
    // Support Bearer token
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7) === HEALTH_AUTH_TOKEN;
    }
    
    // Support direct token
    return authHeader === HEALTH_AUTH_TOKEN;
}

/**
 * Checks if Redis is available
 * @returns {Promise<boolean>}
 */
async function checkRedis() {
    try {
        const redis = await getLockRedis();
        if (!redis) {
            return false;
        }
        await redis.ping();
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if database is available
 * @returns {Promise<boolean>}
 */
async function checkDatabase() {
    try {
        const knex = getKnex();
        if (!knex) {
            return false;
        }
        await knex.raw('SELECT 1');
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if Discord gateway is connected
 * @param {Client} client - Discord client
 * @returns {boolean}
 */
function checkDiscord(client) {
    return client && client.isReady() && client.ws.status === 0;
}

/**
 * Performs a full health check
 * @param {Client} client - Discord client
 * @returns {Promise<object>} Health check result
 */
export async function performHealthCheck(client) {
    const checks = {
        redis: await checkRedis(),
        database: await checkDatabase(),
        discord: checkDiscord(client),
        uptime: Date.now() - startupTime
    };
    
    const healthy = checks.redis && checks.database && checks.discord;
    
    return {
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: checks.uptime,
        checks
    };
}

/**
 * Performs a readiness check (lighter than health check)
 * @param {Client} client - Discord client
 * @returns {Promise<object>} Readiness check result
 */
export async function performReadinessCheck(client) {
    const checks = {
        redis: await checkRedis(),
        database: await checkDatabase(),
        discord: checkDiscord(client)
    };
    
    const ready = checks.redis && checks.database && checks.discord;
    isReady = ready;
    
    return {
        status: ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks
    };
}

/**
 * Starts the health check and metrics HTTP server
 * @param {Client} client - Discord client
 * @returns {Promise<Server>} HTTP server instance
 */
export async function startHealthServer(client) {
    const port = process.env.HEALTH_PORT ? parseInt(process.env.HEALTH_PORT, 10) : 9090;
    const host = process.env.HEALTH_HOST || '0.0.0.0';
    
    if (healthServer) {
        console.log('[HEALTH] Health server already running');
        return healthServer;
    }
    
    healthServer = createServer(async(req, res) => {
        // Check authentication
        if (!isAuthenticated(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        const url = new URL(req.url, `http://${host}:${port}`);
        
        try {
            if (url.pathname === '/health') {
                const health = await performHealthCheck(client);
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(health, null, 2));
                
            } else if (url.pathname === '/ready') {
                const readiness = await performReadinessCheck(client);
                const statusCode = readiness.status === 'ready' ? 200 : 503;
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(readiness, null, 2));
                
            } else if (url.pathname === '/metrics') {
                // Prometheus metrics endpoint
                res.setHeader('Content-Type', register.contentType);
                const metrics = await register.metrics();
                res.end(metrics);
                
            } else if (url.pathname === '/metrics/json') {
                // JSON format metrics
                const metrics = await register.getMetricsAsJSON();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metrics, null, 2));
                
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
            }
        } catch (error) {
            console.error('[HEALTH] Error handling request:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
    
    // Record gateway latency every 15 seconds
    const latencyInterval = setInterval(() => {
        if (client && client.ws && client.ws.shards) {
            client.ws.shards.forEach((shard, shardId) => {
                if (shard.ping !== undefined) {
                    recordGatewayLatency(String(shardId), shard.ping);
                }
            });
        }
    }, 15000);

    // Clear interval when server stops
    healthServer.on('close', () => {
        clearInterval(latencyInterval);
    });

    return new Promise((resolve, reject) => {
        healthServer.listen(port, host, () => {
            console.log(`[HEALTH] Health server listening on ${host}:${port}`);
            console.log('[HEALTH] Endpoints: /health, /ready, /metrics, /metrics/json');
            if (HEALTH_AUTH_TOKEN) {
                console.log('[HEALTH] Authentication enabled (Bearer token required)');
            }
            resolve(healthServer);
        });
        
        healthServer.on('error', (error) => {
            console.error('[HEALTH] Server error:', error);
            reject(error);
        });
    });
}

/**
 * Stops the health check server
 * @returns {Promise<void>}
 */
export async function stopHealthServer() {
    if (healthServer) {
        return new Promise((resolve) => {
            healthServer.close(() => {
                console.log('[HEALTH] Health server stopped');
                healthServer = null;
                resolve();
            });

    
        });
    }
}

/**
 * Sets the ready state manually
 * @param {boolean} ready - Ready state
 */
export function setReady(ready) {
    isReady = ready;
}

/**
 * Gets the current ready state
 * @returns {boolean}
 */
export function getReadyState() {
    return isReady;
}

/**
 * Records startup completion
 */
export function recordStartupComplete() {
    startupTime = Date.now();
}

export default {
    startHealthServer,
    stopHealthServer,
    performHealthCheck,
    performReadinessCheck,
    setReady,
    getReadyState,
    recordStartupComplete
};