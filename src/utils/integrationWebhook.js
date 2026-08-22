import { logger } from './utils/logger.js';
/* eslint-disable no-console */
import { createHmac, timingSafeEqual } from 'crypto';
import { formatGithubPushNotification, formatGithubPrNotification, formatGithubIssueNotification } from './integrationFormatters.js';

let server = null;

const seenDeliveries = new Map();
const DELIVERY_TTL_MS = 10 * 60 * 1000;

function isReplay(deliveryId) {
    if (!deliveryId) { return false; }
    const now = Date.now();
    for (const [id, ts] of seenDeliveries) {
        if (now - ts > DELIVERY_TTL_MS) { seenDeliveries.delete(id); }
    }
    if (seenDeliveries.has(deliveryId)) { return true; }
    seenDeliveries.set(deliveryId, now);
    return false;
}

export async function startWebhookServer(port, secret, discordClient) {
    if (!port || !secret) {return;}

    const http = await import('http');

    server = http.createServer(async(req, res) => {
        if (req.method !== 'POST' || req.url !== '/webhooks/github') {
            res.writeHead(404);
            res.end();
            return;
        }

        const MAX_BODY_BYTES = 1024 * 1024;
        const chunks = [];
        let totalBytes = 0;
        for await (const chunk of req) {
            totalBytes += chunk.length;
            if (totalBytes > MAX_BODY_BYTES) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Body too large' }));
                return;
            }
            chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf-8');

        const signature = req.headers['x-hub-signature-256'];
        if (!signature || !verifyGithubSignature(body, signature, secret)) {
            res.writeHead(401);
            res.end('Invalid signature');
            return;
        }

        const deliveryId = req.headers['x-github-delivery'];
        if (isReplay(deliveryId)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'duplicate, ignored' }));
            return;
        }

        const eventType = req.headers['x-github-event'];
        let payload;
        try {
            payload = JSON.parse(body);
        } catch {
            res.writeHead(400);
            res.end('Invalid JSON');
            return;
        }

        const notification = await handleGithubEvent(eventType, payload);
        if (notification && discordClient) {
            const repo = payload.repository?.full_name;
            if (repo) {
                try {
                    const { getData } = await import('./db.js');
                    const data = await getData('integrations');
                    const subs = (data?.subscriptions || []).filter(s =>
                        s.type === 'github' && s.target_id === repo
                    );
                    for (const sub of subs) {
                        const channel = discordClient.channels.cache.get(sub.channel_id);
                        if (channel) {channel.send(notification).catch(() => {});}
                    }
                } catch { /* silently ignore db/channel errors */ }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    });

    server.listen(port, () => {
        logger.info(`[Integrations] GitHub webhook server listening on port ${port}`);
    });
}

export function stopWebhookServer() {
    if (server) {
        server.close();
        server = null;
    }
}

export function verifyGithubSignature(body, signature, secret) {
    if (!secret) {return false;}
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

export async function handleGithubEvent(eventType, body) {
    if (eventType === 'ping') {return null;}

    const repo = body.repository?.full_name || 'unknown';
    const sender = body.sender?.login || 'unknown';

    switch (eventType) {
    case 'push':
        return formatGithubPushNotification(repo, sender, body.ref, (body.commits || []));
    case 'pull_request':
        if (!body.pull_request) {return null;}
        return formatGithubPrNotification(repo, sender, body.pull_request);
    case 'issues':
        if (!body.issue) {return null;}
        return formatGithubIssueNotification(repo, sender, body.issue);
    default:
        return null;
    }
}
