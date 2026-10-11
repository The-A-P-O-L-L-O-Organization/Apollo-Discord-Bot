import { describe, it, expect, afterEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError, CircuitState } from '../../src/utils/circuitBreaker.js';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function postAnalysis(url: string): Promise<Response> {
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) {
        throw new Error(`NSFW service responded ${response.status}`);
    }
    return response;
}

interface DeadLetter {
    url: string;
    attempts: number;
    lastError: string;
}

describe.skipIf(!CHAOS_ENABLED)('chaos: external service failure', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('retries with exponential backoff, opens the breaker, and dead-letters after max attempts', async () => {
        let fetchCalls = 0;
        vi.stubGlobal('fetch', async (_input: unknown, _init?: unknown): Promise<Response> => {
            fetchCalls += 1;
            if (fetchCalls === 1) {
                throw new Error('fetch failed: ETIMEDOUT');
            }
            return new Response('Service Unavailable', { status: 503 });
        });

        const breaker = new CircuitBreaker('chaos-nsfw-service', {
            failureThreshold: 3,
            successThreshold: 1,
            timeout: 60000,
            rollingWindow: 60000,
            minimumRequests: 3
        });
        const scheduledDelays: number[] = [];
        const deadLetters: DeadLetter[] = [];
        const url = 'https://nsfw.internal/analyze';
        let result: Response | null = null;
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                result = await breaker.execute(() => postAnalysis(url));
                break;
            } catch (err) {
                lastError = err;
                if (attempt < 3) {
                    const delay = 20 * 2 ** (attempt - 1);
                    scheduledDelays.push(delay);
                    await sleep(delay);
                }
            }
        }

        expect(result).toBeNull();
        expect(fetchCalls).toBe(3);
        expect(scheduledDelays).toEqual([20, 40]);
        expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

        await expect(breaker.execute(() => postAnalysis(url))).rejects.toBeInstanceOf(CircuitBreakerOpenError);
        expect(fetchCalls).toBe(3);

        deadLetters.push({
            url,
            attempts: 3,
            lastError: lastError instanceof Error ? lastError.message : String(lastError)
        });
        expect(deadLetters.length).toBe(1);
        expect(deadLetters[0]?.attempts).toBe(3);
        expect(deadLetters[0]?.url).toBe(url);
    });

    it('recovers and closes the breaker once the service is healthy again', async () => {
        vi.stubGlobal('fetch', async (): Promise<Response> => {
            return new Response(JSON.stringify({ isNsfw: false }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        });

        const breaker = new CircuitBreaker('chaos-nsfw-recovery', {
            failureThreshold: 3,
            successThreshold: 1,
            timeout: 50,
            rollingWindow: 60000,
            minimumRequests: 1
        });
        breaker.forceOpen();
        expect(breaker.getStatus().state).toBe(CircuitState.OPEN);

        await sleep(100);
        const response = await breaker.execute(() => postAnalysis('https://nsfw.internal/analyze'));
        expect(response.status).toBe(200);
        expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
    });
});
