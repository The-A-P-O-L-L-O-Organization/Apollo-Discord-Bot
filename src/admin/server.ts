// Admin HTTP Server
// Serves Bull Board queue dashboard and other admin endpoints
import { serve } from '@hono/node-server';
import { bullBoardApp } from './bullboard.js';
import { config } from '../config/config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'admin:server' });

let adminServer: ReturnType<typeof serve> | null = null;

/**
 * Starts the admin HTTP server
 * @returns {Promise<void>}
 */
export async function startAdminServer(): Promise<void> {
    if (!config.queue.enabled) {
        logger.info('[ADMIN] Queue disabled, skipping admin server');
        return;
    }

    const port = process.env['ADMIN_PORT'] ? parseInt(process.env['ADMIN_PORT'], 10) : 9091;
    const host = process.env['ADMIN_HOST'] ?? '0.0.0.0';

    if (adminServer) {
        logger.info('[ADMIN] Admin server already running');
        return;
    }

    adminServer = serve({
        fetch: bullBoardApp.fetch,
        port,
        hostname: host
    });

    logger.info(`[ADMIN] Admin server listening on ${host}:${port}`);
    logger.info('[ADMIN] Bull Board dashboard available at /admin/queues');
}

/**
 * Stops the admin HTTP server
 * @returns {Promise<void>}
 */
export async function stopAdminServer(): Promise<void> {
    if (adminServer) {
        adminServer.close();
        adminServer = null;
        logger.info('[ADMIN] Admin server stopped');
    }
}

export default {
    startAdminServer,
    stopAdminServer
};