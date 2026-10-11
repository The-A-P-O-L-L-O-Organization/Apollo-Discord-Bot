import { describe, it, expect } from 'vitest';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

const QUEUE_ATTEMPTS = 3;

interface FakeJob {
    id: string;
    name: string;
    attemptsMade: number;
}

interface JobOutcome {
    status: 'completed' | 'failed';
    attempts: number;
}

class FakeWorker {
    public running = false;

    constructor(
        private maxAttempts: number,
        private onExhausted: (job: FakeJob) => void
    ) {}

    start(): void {
        this.running = true;
    }

    async stop(): Promise<void> {
        this.running = false;
    }

    async run(job: FakeJob, handler: (job: FakeJob) => Promise<void>): Promise<JobOutcome> {
        for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
            if (!this.running) {
                throw new Error('Worker stopped before job completed');
            }
            try {
                await handler(job);
                return { status: 'completed', attempts: attempt };
            } catch (err) {
                if (err instanceof Error && err.message.includes('SIGTERM')) {
                    throw err;
                }
                job.attemptsMade = attempt;
                if (attempt >= this.maxAttempts) {
                    this.onExhausted(job);
                    return { status: 'failed', attempts: attempt };
                }
            }
        }
        throw new Error('Unreachable: attempt loop exhausted without outcome');
    }
}

describe.skipIf(!CHAOS_ENABLED)('chaos: worker restart', () => {
    it('re-queues a SIGTERM-interrupted job and completes it exactly once after restart', async () => {
        const deadLetters: FakeJob[] = [];
        const applied = new Set<string>();
        let sideEffects = 0;
        let crashed = false;

        const handler = async (job: FakeJob): Promise<void> => {
            if (applied.has(job.id)) {
                return;
            }
            applied.add(job.id);
            sideEffects += 1;
            if (!crashed) {
                crashed = true;
                throw new Error('SIGTERM received mid-job');
            }
        };

        const job: FakeJob = { id: 'cmd-1', name: 'process-command', attemptsMade: 0 };
        const workerA = new FakeWorker(QUEUE_ATTEMPTS, (failed) => {
            deadLetters.push(failed);
        });
        workerA.start();
        await expect(workerA.run(job, handler)).rejects.toThrow('SIGTERM received mid-job');
        await workerA.stop();
        expect(job.attemptsMade).toBe(0);
        expect(sideEffects).toBe(1);

        const workerB = new FakeWorker(QUEUE_ATTEMPTS, (failed) => {
            deadLetters.push(failed);
        });
        workerB.start();
        const outcome = await workerB.run(job, handler);
        await workerB.stop();

        expect(outcome.status).toBe('completed');
        expect(sideEffects).toBe(1);
        expect(deadLetters.length).toBe(0);
    });

    it('dead-letters a job only after all attempts are exhausted', async () => {
        const deadLetters: FakeJob[] = [];
        let handlerCalls = 0;
        const worker = new FakeWorker(QUEUE_ATTEMPTS, (failed) => {
            deadLetters.push(failed);
        });
        worker.start();

        const job: FakeJob = { id: 'cmd-poison', name: 'process-command', attemptsMade: 0 };
        const outcome = await worker.run(job, async () => {
            handlerCalls += 1;
            throw new Error('permanent handler failure');
        });
        await worker.stop();

        expect(outcome).toEqual({ status: 'failed', attempts: QUEUE_ATTEMPTS });
        expect(handlerCalls).toBe(QUEUE_ATTEMPTS);
        expect(job.attemptsMade).toBe(QUEUE_ATTEMPTS);
        expect(deadLetters.length).toBe(1);
        expect(deadLetters[0]?.id).toBe('cmd-poison');
    });
});
