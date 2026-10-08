import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { RedisContainer } from '@testcontainers/redis';
import type { StartedRedisContainer } from '@testcontainers/redis';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { tryAcquireLock, startHeartbeat, stopHeartbeat } from '../../src/gateway/leader.js';
import { withLock } from '../../src/utils/lock.js';
import type { RedisClient } from '../../src/utils/redisCluster.js';

const _Redis = Redis as unknown as new (options?: unknown) => RedisType;

interface GatewayPod {
    podId: string;
    redis: RedisType;
    isLeader: boolean;
    alive: boolean;
    stopPodHeartbeat: (() => void) | null;
}

interface MockDiscordClient {
    user: { id: string };
    isReady: () => boolean;
}

function createMockDiscordClient(): MockDiscordClient {
    return {
        user: { id: 'mock-discord-client' },
        isReady: () => true
    };
}

function createPod(podId: string, host: string, port: number): GatewayPod {
    const redis = new _Redis({
        host,
        port,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
            if (times > 5) {
                return null;
            }
            return Math.min(times * 100, 1000);
        },
        enableReadyCheck: true,
        lazyConnect: false,
        protocol: 2
    });
    return { podId, redis, isLeader: false, alive: true, stopPodHeartbeat: null };
}

async function campaignForLeadership(pod: GatewayPod, lockKey: string, ttlMs: number): Promise<boolean> {
    const acquired = await tryAcquireLock(pod.redis, lockKey, pod.podId, ttlMs);
    if (acquired) {
        pod.isLeader = true;
        pod.stopPodHeartbeat = startHeartbeat(pod.redis, lockKey, pod.podId, ttlMs);
    }
    return acquired;
}

async function crashPodWithoutRelease(pod: GatewayPod): Promise<void> {
    pod.alive = false;
    pod.isLeader = false;
    if (pod.stopPodHeartbeat) {
        pod.stopPodHeartbeat();
        pod.stopPodHeartbeat = null;
    }
    await pod.redis.quit();
}

async function schedulerTick(
    pod: GatewayPod,
    jobKey: string,
    countKey: string,
    client: MockDiscordClient,
    job: (c: MockDiscordClient) => Promise<void>
): Promise<boolean> {
    const result = await withLock(pod.redis as unknown as RedisClient, jobKey, pod.podId, async () => {
        await job(client);
        await pod.redis.incr(countKey);
        return true;
    }, 5000);
    return result !== false;
}

async function waitForCondition(condition: () => Promise<boolean>, timeoutMs: number, intervalMs = 100): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await condition()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
}

describe('Leader Failover with Scheduler Idempotency', () => {
    let container: StartedRedisContainer | null = null;
    let redisHost = '';
    let redisPort = 0;

    beforeAll(async () => {
        try {
            container = await new RedisContainer('redis:8-alpine').start();
            redisHost = container.getHost();
            redisPort = container.getPort();
        } catch {
            redisHost = '';
            redisPort = 0;
        }
    }, 120000);

    afterAll(async () => {
        stopHeartbeat();
        if (container) {
            await container.stop();
            container = null;
        }
    }, 60000);

    it('should fail over leadership and run scheduler jobs exactly once', async () => {
        if (!container || redisPort === 0) {
            return;
        }
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const lockKey = `apollo:gateway:leader:failover-${suffix}`;
        const jobKey = `scheduler:failover-job-${suffix}`;
        const countKey = `scheduler:failover-count-${suffix}`;
        const ttlMs = 1000;

        const leader = createPod(`pod-leader-${suffix}`, redisHost, redisPort);
        const follower = createPod(`pod-follower-${suffix}`, redisHost, redisPort);
        const mockClient = createMockDiscordClient();
        const job = vi.fn(async (_client: MockDiscordClient) => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        try {
            const leaderAcquired = await campaignForLeadership(leader, lockKey, ttlMs);
            expect(leaderAcquired).toBe(true);
            expect(leader.isLeader).toBe(true);

            const followerAcquired = await campaignForLeadership(follower, lockKey, ttlMs);
            expect(followerAcquired).toBe(false);
            expect(follower.isLeader).toBe(false);

            const holderBefore = await leader.redis.get(lockKey);
            expect(holderBefore).toBe(leader.podId);

            const preFailoverRounds = 5;
            for (let round = 0; round < preFailoverRounds; round += 1) {
                const [leaderRan, followerRan] = await Promise.all([
                    schedulerTick(leader, jobKey, countKey, mockClient, job),
                    schedulerTick(follower, jobKey, countKey, mockClient, job)
                ]);
                const ranCount = Number(leaderRan) + Number(followerRan);
                expect(ranCount).toBe(1);
            }
            const countAfterPre = await follower.redis.get(countKey);
            expect(countAfterPre).toBe(String(preFailoverRounds));

            await crashPodWithoutRelease(leader);
            expect(leader.alive).toBe(false);

            const staleHolder = await follower.redis.get(lockKey);
            expect(staleHolder).toBe(leader.podId);

            const failoverHappened = await waitForCondition(async () => {
                if (follower.isLeader) {
                    return true;
                }
                const acquired = await campaignForLeadership(follower, lockKey, ttlMs);
                return acquired;
            }, 15000);
            expect(failoverHappened).toBe(true);
            expect(follower.isLeader).toBe(true);

            const holderAfter = await follower.redis.get(lockKey);
            expect(holderAfter).toBe(follower.podId);

            const postFailoverRounds = 5;
            for (let round = 0; round < postFailoverRounds; round += 1) {
                const ran = await schedulerTick(follower, jobKey, countKey, mockClient, job);
                expect(ran).toBe(true);
            }

            const finalCount = await follower.redis.get(countKey);
            expect(finalCount).toBe(String(preFailoverRounds + postFailoverRounds));
            expect(job).toHaveBeenCalledTimes(preFailoverRounds + postFailoverRounds);
            for (const call of job.mock.calls) {
                const firstArg = call[0] as MockDiscordClient | undefined;
                expect(firstArg?.user.id).toBe('mock-discord-client');
            }
        } finally {
            if (leader.stopPodHeartbeat) {
                leader.stopPodHeartbeat();
                leader.stopPodHeartbeat = null;
            }
            if (follower.stopPodHeartbeat) {
                follower.stopPodHeartbeat();
                follower.stopPodHeartbeat = null;
            }
            stopHeartbeat();
            if (leader.alive) {
                await leader.redis.quit();
            }
            await follower.redis.quit();
        }
    }, 60000);

    it('should grant only one winner on concurrent scheduler ticks', async () => {
        if (!container || redisPort === 0) {
            return;
        }
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        const jobKey = `scheduler:concurrent-job-${suffix}`;
        const countKey = `scheduler:concurrent-count-${suffix}`;

        const podA = createPod(`pod-a-${suffix}`, redisHost, redisPort);
        const podB = createPod(`pod-b-${suffix}`, redisHost, redisPort);
        const mockClient = createMockDiscordClient();
        const job = vi.fn(async (_client: MockDiscordClient) => {
            await new Promise((resolve) => setTimeout(resolve, 30));
        });

        try {
            const attempts = await Promise.all([
                schedulerTick(podA, jobKey, countKey, mockClient, job),
                schedulerTick(podB, jobKey, countKey, mockClient, job),
                schedulerTick(podA, jobKey, countKey, mockClient, job),
                schedulerTick(podB, jobKey, countKey, mockClient, job)
            ]);
            const winners = attempts.filter((ran) => ran);
            expect(winners.length).toBe(1);
            const stored = await podA.redis.get(countKey);
            expect(Number(stored)).toBe(winners.length);
            expect(job.mock.calls.length).toBe(winners.length);
        } finally {
            stopHeartbeat();
            await podA.redis.quit();
            await podB.redis.quit();
        }
    }, 60000);
});
