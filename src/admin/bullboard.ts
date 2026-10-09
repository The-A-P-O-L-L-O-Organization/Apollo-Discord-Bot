// Bull Board Queue Dashboard
// Provides admin dashboard for BullMQ queue monitoring behind owner auth
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { queues } from '../queue/queue.js';
import { isOwner } from '../utils/accessControl.js';
import type { Context, Next } from 'hono';
import type { Queue } from 'bullmq';

// Create Hono app for bull board
const bullBoardApp = new Hono();

// Owner authentication middleware (non-async as per Hono best practices)
async function requireOwnerAuth(c: Context, next: Next): Promise<Response | void> {
    const userId = c.req.header('X-User-ID');
    if (userId && isOwner(userId)) {
        await next();
        return;
    }
    return c.json({ error: 'Owner authentication required' }, 401);
}

// Apply owner check to all bull board routes
bullBoardApp.use('/admin/queues/*', requireOwnerAuth);

// Create Bull Board with all queues
const queueAdapters = Array.from(queues.values())
    .filter((q): q is Queue => !('_enabled' in q && q._enabled === false))
    .map(q => new BullMQAdapter(q));

// Create HonoAdapter with serveStatic
const honoAdapter = new HonoAdapter(serveStatic);

// Create Bull Board instance
createBullBoard({
    queues: queueAdapters,
    serverAdapter: honoAdapter,
    options: {
        uiConfig: {
            boardTitle: 'Apollo Bot - Queue Dashboard'
        }
    }
});

// Mount Bull Board routes
bullBoardApp.route('/admin/queues', honoAdapter.registerPlugin());

// Export the Hono app
export { bullBoardApp };
export default bullBoardApp;