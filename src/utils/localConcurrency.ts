import pLimit from 'p-limit';

export type LocalLimiterName = 'twitch' | 'youtube' | 'rss' | 'translation' | 'openaiModeration';

export interface LocalLimiter {
    readonly name: LocalLimiterName;
    readonly concurrency: number;
    readonly activeCount: number;
    readonly pendingCount: number;
    run<T>(task: () => PromiseLike<T>): Promise<T>;
    shutdown(): void;
}

const MAX_LOCAL_CONCURRENCY = 100;

export function createLocalLimiter(name: LocalLimiterName, concurrency: number): LocalLimiter {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_LOCAL_CONCURRENCY) {
        throw new Error(`${name} limiter concurrency must be an integer between 1 and ${MAX_LOCAL_CONCURRENCY}`);
    }

    const limit = pLimit(concurrency);
    let shutDown = false;
    const pending = new Set<{ started: boolean; reject: (reason: Error) => void }>();

    return {
        name,
        concurrency,
        get activeCount() {
            return limit.activeCount;
        },
        get pendingCount() {
            return limit.pendingCount;
        },
        run<T>(task: () => PromiseLike<T>): Promise<T> {
            if (shutDown) {
                return Promise.reject(new Error(`${name} limiter is shut down`));
            }
            return new Promise<T>((resolve, reject) => {
                const entry = { started: false, reject };
                pending.add(entry);
                const limitedTask = limit(async() => {
                    entry.started = true;
                    pending.delete(entry);
                    return task();
                });
                void limitedTask.then(resolve, reject);
            });
        },
        shutdown(): void {
            if (shutDown) {
                return;
            }
            shutDown = true;
            const error = new Error(`${name} limiter is shut down`);
            for (const entry of pending) {
                if (!entry.started) {
                    entry.reject(error);
                }
            }
            pending.clear();
            limit.clearQueue();
        }
    };
}
