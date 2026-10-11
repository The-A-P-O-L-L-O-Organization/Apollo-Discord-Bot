import { createLogger } from './logger.js';

const log = createLogger({ module: 'breachNotify' });

export type BreachRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface BreachNotification {
    reference: string;
    summary: string;
    riskLevel: BreachRiskLevel;
    affectedGuilds?: string[];
    affectedUsers?: number;
    detectedAt?: string;
}

interface NotifyOptions {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

function isValidWebhookUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

export function buildBreachPayload(notification: BreachNotification): Record<string, unknown> {
    const lines = [
        '**Security incident notice**',
        `Reference: ${notification.reference}`,
        `Risk level: ${notification.riskLevel}`,
        `Summary: ${notification.summary}`
    ];
    if (typeof notification.affectedUsers === 'number') {
        lines.push(`Affected users (approx.): ${notification.affectedUsers}`);
    }
    if (notification.affectedGuilds && notification.affectedGuilds.length > 0) {
        lines.push(`Affected guilds: ${notification.affectedGuilds.length}`);
    }
    if (notification.detectedAt) {
        lines.push(`Detected at: ${notification.detectedAt}`);
    }
    return { content: lines.join('\n') };
}

export async function notifyBreach(
    webhookUrl: string,
    notification: BreachNotification,
    options: NotifyOptions = {}
): Promise<boolean> {
    const { timeoutMs = 10000, fetchImpl = fetch } = options;
    if (!webhookUrl || !isValidWebhookUrl(webhookUrl)) {
        log.warn({ reference: notification.reference }, 'Breach notification skipped: invalid webhook URL');
        return false;
    }
    if (!notification.reference || !notification.summary) {
        log.warn('Breach notification skipped: missing reference or summary');
        return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
    try {
        const response = await fetchImpl(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBreachPayload(notification)),
            signal: controller.signal
        });
        if (!response.ok) {
            log.warn({ reference: notification.reference, status: response.status }, 'Breach notification delivery failed');
            return false;
        }
        log.info({ reference: notification.reference, riskLevel: notification.riskLevel }, 'Breach notification delivered');
        return true;
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        log.warn({ reference: notification.reference, error: message }, 'Breach notification error');
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export default {
    buildBreachPayload,
    notifyBreach
};
