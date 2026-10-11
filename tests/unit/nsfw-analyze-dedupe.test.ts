import { describe, it, expect, vi, beforeEach } from 'vitest';

interface AddCall {
    name: string;
    data: unknown;
    opts: Record<string, unknown>;
}

interface FakeJob {
    id: string;
    name: string;
    data: unknown;
}

const addCalls: AddCall[] = [];
const dedupeStore = new Map<string, { job: FakeJob; expiresAt: number }>();
let now = 1000000;

vi.mock('../../src/queue/queue.js', () => ({
    createQueue: vi.fn(async () => ({
        name: 'nsfw:analyze',
        add: async (name: string, data: unknown, opts: Record<string, unknown>): Promise<FakeJob> => {
            addCalls.push({ name, data, opts });
            const dedup = opts['deduplication'] as { id: string; ttl: number } | undefined;
            const jobId = opts['jobId'] as string | undefined;
            if (typeof dedup?.id === 'string') {
                const existing = dedupeStore.get(dedup.id);
                if (existing && existing.expiresAt > now) {
                    return existing.job;
                }
                const job: FakeJob = { id: (jobId ?? dedup.id), name, data };
                dedupeStore.set(dedup.id, { job, expiresAt: now + dedup.ttl });
                return job;
            }
            return { id: `job-${addCalls.length}`, name, data };
        },
        close: async (): Promise<void> => undefined
    })),
    JobNames: { NSFW_ANALYZE: 'nsfw:analyze' }
}));

import { buildNsfwJobId, enqueueNsfwAnalysis, NSFW_DEDUPE_TTL_MS } from '../../src/queue/jobs/nsfwAnalyze.js';

describe('nsfw analyze deduplication', () => {
    beforeEach(() => {
        addCalls.length = 0;
        dedupeStore.clear();
        now = 1000000;
        vi.clearAllMocks();
    });

    it('uses a deterministic jobId with the nsfw: prefix', () => {
        const first = buildNsfwJobId('https://cdn.example/a.png', 'g1');
        const second = buildNsfwJobId('https://cdn.example/a.png', 'g1');

        expect(first).toBe(second);
        expect(first.startsWith('nsfw:')).toBe(true);
    });

    it('produces different jobIds for different images', () => {
        const first = buildNsfwJobId('https://cdn.example/a.png', 'g1');
        const second = buildNsfwJobId('https://cdn.example/b.png', 'g1');

        expect(first).not.toBe(second);
    });

    it('scopes jobIds per guild', () => {
        const first = buildNsfwJobId('https://cdn.example/a.png', 'g1');
        const second = buildNsfwJobId('https://cdn.example/a.png', 'g2');

        expect(first).not.toBe(second);
    });

    it('uses the 5 minute dedupe TTL', () => {
        expect(NSFW_DEDUPE_TTL_MS).toBe(300000);
    });

    it('same image enqueued twice yields one deduplicated job', async () => {
        const first = await enqueueNsfwAnalysis('https://cdn.example/a.png', 'g1');
        const second = await enqueueNsfwAnalysis('https://cdn.example/a.png', 'g1');

        expect(first).toEqual({ imageUrl: 'https://cdn.example/a.png', guildId: 'g1', threshold: 0.6 });
        expect(second).toEqual(first);
        expect(addCalls).toHaveLength(2);
        const firstAdd = addCalls[0];
        const secondAdd = addCalls[1];
        if (!firstAdd || !secondAdd) {
            throw new Error('expected two enqueue calls');
        }
        const firstOpts = firstAdd.opts;
        const secondOpts = secondAdd.opts;
        expect(firstOpts['jobId']).toBe('nsfw:' + buildNsfwJobId('https://cdn.example/a.png', 'g1').slice('nsfw:'.length));
        expect(secondOpts['jobId']).toBe(firstOpts['jobId']);
        expect(secondOpts['deduplication']).toEqual({ id: firstOpts['jobId'], ttl: 300000 });

        const dedupIds = new Set(addCalls.map((call) => (call.opts['deduplication'] as { id: string }).id));
        expect(dedupIds.size).toBe(1);
    });

    it('different images are both processed', async () => {
        await enqueueNsfwAnalysis('https://cdn.example/a.png', 'g1');
        await enqueueNsfwAnalysis('https://cdn.example/b.png', 'g1');

        expect(addCalls).toHaveLength(2);
        const ids = addCalls.map((call) => call.opts['jobId'] as string);
        expect(ids[0]).not.toBe(ids[1]);
        expect(dedupeStore.size).toBe(2);
    });

    it('TTL expiry allows re-processing after 5 minutes', async () => {
        await enqueueNsfwAnalysis('https://cdn.example/a.png', 'g1');
        expect(addCalls).toHaveLength(1);
        const firstCall = addCalls[0];
        if (!firstCall) {
            throw new Error('expected first enqueue call');
        }
        const dedupId = (firstCall.opts['deduplication'] as { id: string }).id;
        const original = dedupeStore.get(dedupId)?.job;

        now += NSFW_DEDUPE_TTL_MS + 1;

        await enqueueNsfwAnalysis('https://cdn.example/a.png', 'g1');
        const replacement = dedupeStore.get(dedupId)?.job;

        expect(addCalls).toHaveLength(2);
        expect(replacement).toBeDefined();
        expect(original).toBeDefined();
        expect(replacement).not.toBe(original);
    });
});
