// Integration Webhook Server
// Handles GitHub webhook events with signature verification and replay protection
import { logger } from './logger.js';

import { createHmac, timingSafeEqual } from 'crypto';
import { formatGithubPushNotification, formatGithubPrNotification, formatGithubIssueNotification } from './integrationFormatters.js';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Client, TextChannel } from 'discord.js';
import type { GithubCommit, GithubPR, GithubIssue, NotificationPayload } from './integrationFormatters.js';

let server: Server | null = null;

const seenDeliveries = new Map<string, number>();
const DELIVERY_TTL_MS = 10 * 60 * 1000;

function isReplay(deliveryId: string | undefined): boolean {
    if (!deliveryId) { return false; }
    const now = Date.now();
    for (const [id, ts] of seenDeliveries) {
        if (now - ts > DELIVERY_TTL_MS) { seenDeliveries.delete(id); }
    }
    if (seenDeliveries.has(deliveryId)) { return true; }
    seenDeliveries.set(deliveryId, now);
    return false;
}

export async function startWebhookServer(port: number, secret: string, discordClient: Client): Promise<void> {
    if (!port || !secret) { return; }

    const http = await import('http');

    server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST' || req.url !== '/webhooks/github') {
            res.writeHead(404);
            res.end();
            return;
        }

        const MAX_BODY_BYTES = 1024 * 1024;
        const chunks: Buffer[] = [];
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
        if (!signature || !verifyGithubSignature(body, signature as string, secret)) {
            res.writeHead(401);
            res.end('Invalid signature');
            return;
        }

        const deliveryId = req.headers['x-github-delivery'];
        if (isReplay(deliveryId as string | undefined)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'duplicate, ignored' }));
            return;
        }

        const eventType = req.headers['x-github-event'];
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(body) as Record<string, unknown>;
        } catch {
            res.writeHead(400);
            res.end('Invalid JSON');
            return;
        }

        const notification = await handleGithubEvent(eventType as string | undefined, payload);
        if (notification && discordClient) {
            const repo = payload['repository'] as Record<string, unknown> | undefined;
            const repoName = repo?.['full_name'] as string | undefined;
            if (repoName) {
                try {
                    const { getData } = await import('./db.js');
                    const data = await getData('integrations') as Record<string, unknown> | undefined;
                    const subs = (data?.['subscriptions'] as Record<string, unknown>[]) || [];
                    const githubSubs = subs.filter((s: Record<string, unknown>) =>
                        s['type'] === 'github' && s['target_id'] === repoName
                    );
                    for (const sub of githubSubs) {
                        const channel = discordClient.channels.cache.get(sub['channel_id'] as string);
                        if (channel?.isTextBased()) {
                            (channel as TextChannel).send(notification).catch(() => {});
                        }
                    }
                } catch {
                    // silently ignore db/channel errors
                }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    });

    server.listen(port, () => {
        logger.info(`[Integrations] GitHub webhook server listening on port ${port}`);
    });
}

export function stopWebhookServer(): void {
    if (server) {
        server.close();
        server = null;
    }
}

export function verifyGithubSignature(body: string, signature: string, secret: string): boolean {
    if (!secret) { return false; }
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

export async function handleGithubEvent(eventType: string | undefined, body: Record<string, unknown>): Promise<NotificationPayload | null> {
    if (eventType === 'ping') { return null; }

    const repo = (body['repository'] as Record<string, unknown> | undefined)?.['full_name'] as string || 'unknown';
    const sender = (body['sender'] as Record<string, unknown> | undefined)?.['login'] as string || 'unknown';

    switch (eventType) {
    case 'push':
        return formatGithubPushNotification(repo, sender, body['ref'] as string, (body['commits'] as GithubCommit[]) || []);
    case 'pull_request':
        if (!body['pull_request']) { return null; }
        return formatGithubPrNotification(repo, sender, body['pull_request'] as GithubPR);
    case 'issues':
        if (!body['issue']) { return null; }
        return formatGithubIssueNotification(repo, sender, body['issue'] as GithubIssue);
    default:
        return null;
    }
}

export default {
    startWebhookServer,
    stopWebhookServer,
    verifyGithubSignature,
    handleGithubEvent
};