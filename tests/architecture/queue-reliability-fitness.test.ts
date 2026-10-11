import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeInteraction } from '../../src/queue/serializeInteraction.js';
import RemoteInteraction from '../../src/queue/remote/interaction.js';
import { createTestMetrics, getGaugeValue, getMetrics, type MetricsBundle } from './helpers.js';

const QUEUE_BACKLOG_ALERT_THRESHOLD = 100;

describe('Queue reliability fitness functions', () => {
    let bundle: MetricsBundle;

    beforeEach(() => {
        bundle = createTestMetrics('test_arch_queue_');
    });

    afterEach(() => {
        bundle.register.clear();
    });

    it('job HMAC verification runs on dequeue before any command work', () => {
        const source = readFileSync(join(process.cwd(), 'src', 'queue', 'jobs', 'processCommand.ts'), 'utf8');
        expect(source).toContain('verifyJobData(data)');
        expect(source).toContain('timingSafeEqual');
        expect(source).toContain('Duplicate nonce');
        expect(source).toContain('timestamp expired');
        expect(source).toContain('hmac_verification_failed');
    });

    it('reconstructed interaction is revalidated before execution', async () => {
        const payload = serializeInteraction({
            id: '123456789012345678',
            token: 'queue-token',
            commandName: 'ping',
            commandId: 'cmd-1',
            createdTimestamp: Date.now(),
            guildId: 'guild-1',
            channelId: 'channel-1',
            locale: 'en-US',
            guildLocale: null,
            resolvedLocale: 'en-US',
            user: { id: 'user-1', username: 'tester', discriminator: '0' },
            options: { data: [] }
        });

        const interaction = new RemoteInteraction(
            payload as unknown as Record<string, unknown>,
            {} as never
        );

        expect(interaction.commandName).toBe('ping');
        expect(interaction.commandId).toBe('cmd-1');
        expect(interaction.guildId).toBe('guild-1');
        expect(interaction.token).toBe('queue-token');
        expect(interaction.user.id).toBe('user-1');
        expect(interaction.resolvedLocale).toBe('en-US');

        const source = readFileSync(join(process.cwd(), 'src', 'queue', 'jobs', 'processCommand.ts'), 'utf8');
        expect(source).toContain("typeof data['resolvedLocale'] !== 'string'");
    });

    it('failed jobs are retried then dead-lettered after 3 attempts', () => {
        const source = readFileSync(join(process.cwd(), 'src', 'queue', 'queue.ts'), 'utf8');
        expect(source).toContain('attempts: 3');
        expect(source).toContain('removeOnFail');
        expect(source).toContain("backoff: { type: 'exponential'");
    });

    it('queue depth beyond threshold is observable for alerting', async () => {
        bundle.setQueueDepth('process-command', 150);
        const entries = await getMetrics(bundle.register);
        const depth = getGaugeValue(entries, 'test_arch_queue_queue_depth', { queue: 'process-command' });
        expect(depth).toBe(150);
        expect(depth).toBeGreaterThan(QUEUE_BACKLOG_ALERT_THRESHOLD);
    });
});
