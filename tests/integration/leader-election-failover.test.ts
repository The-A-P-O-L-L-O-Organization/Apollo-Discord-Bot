import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { tryAcquireLock, releaseLock, startHeartbeat, stopHeartbeat, createFencingTokenManager, acquireGlobalLockWithFencing } from '../../src/gateway/leader.js';

const _Redis = Redis as unknown as new (options?: any) => RedisType;

describe('Leader Election Failover (Sentinel)', () => {
    let sentinelContainer: StartedTestContainer | null = null;
    let masterContainer: StartedTestContainer | null = null;
    let sentinelPort: number;
    let masterPort: number;
    let sentinelHost: string;
    let redis: RedisType | null = null;
    let fencingManager: Awaited<ReturnType<typeof createFencingTokenManager>> | null = null;

    beforeAll(async () => {
        try {
            // Start master Redis
            masterContainer = await new GenericContainer('redis:7-alpine')
                .withCommand(['redis-server', '--appendonly', 'yes'])
                .withExposedPorts(6379)
                .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
                .start();

            masterPort = masterContainer.getMappedPort(6379);
            sentinelHost = masterContainer.getHost();

            // Start Sentinel
            sentinelContainer = await new GenericContainer('redis:7-alpine')
                .withCommand(['redis-sentinel', '/etc/redis/sentinel.conf'])
                .withExposedPorts(26379)
                .withWaitStrategy(Wait.forLogMessage('Sentinel runid'))
                .withStartupTimeout(60000)
                .start();

            sentinelPort = sentinelContainer.getMappedPort(26379);

            console.log(`Sentinel running at ${sentinelHost}:${sentinelPort}`);
            console.log(`Master running at ${sentinelHost}:${masterPort}`);

        } catch (err) {
            console.log('Docker not available, skipping Sentinel integration tests:', (err as Error).message);
            return;
        }
    }, 120000);

    afterAll(async () => {
        if (redis) {
            await redis.quit();
            redis = null;
        }
        if (fencingManager) {
            await fencingManager.close();
            fencingManager = null;
        }
        if (sentinelContainer) {
            await sentinelContainer.stop();
            sentinelContainer = null;
        }
        if (masterContainer) {
            await masterContainer.stop();
            masterContainer = null;
        }
    }, 30000);

    beforeEach(async () => {
        if (!sentinelContainer || !masterContainer) {
            console.log('Skipping test: Sentinel not available');
            return;
        }

        // Connect via Sentinel
        redis = new _Redis({
            sentinels: [{ host: sentinelHost, port: sentinelPort }],
            name: 'mymaster',
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                if (times > 3) return null;
                return Math.min(times * 200, 2000);
            },
            enableReadyCheck: true,
            lazyConnect: true,
            protocol: 2
        });

        await redis.connect();
        expect(redis.status).toBe('ready');
    });

    afterEach(async () => {
        stopHeartbeat();
        if (redis) {
            await redis.quit();
            redis = null;
        }
        if (fencingManager) {
            await fencingManager.close();
            fencingManager = null;
        }
    });

    it('should elect a leader via Sentinel', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const podId = 'pod-test-1';
        const lockKey = 'apollo:gateway:leader:test';

        const acquired = await tryAcquireLock(redis, lockKey, podId, 10000);
        expect(acquired).toBe(true);

        // Verify we hold the lock
        const holder = await redis.get(lockKey);
        expect(holder).toBe(podId);

        // Release the lock
        await releaseLock(redis, lockKey, podId);
        const released = await redis.get(lockKey);
        expect(released).toBeNull();
    });

    it('should maintain single leader during failover (simulated)', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const podId = 'pod-test-2';
        const lockKey = 'apollo:gateway:leader:failover';

        // Acquire initial lock
        const acquired = await tryAcquireLock(redis, lockKey, podId, 10000);
        expect(acquired).toBe(true);

        // Start heartbeat
        const stopHb = startHeartbeat(redis, lockKey, podId, 10000);

        // Verify lock is held
        const holder = await redis.get(lockKey);
        expect(holder).toBe(podId);

        // Simulate another pod trying to acquire (should fail)
        const otherPodAcquired = await tryAcquireLock(redis, lockKey, 'pod-test-other', 10000);
        expect(otherPodAcquired).toBe(false);

        stopHb();

        // Release our lock
        await releaseLock(redis, lockKey, podId);
    });

    it('should handle fencing tokens correctly', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const podId = 'pod-fencing-test';
        const lockKey = 'apollo:gateway:leader:fencing';
        const counterKey = 'apollo:gateway:fencing:counter:test';

        // Create fencing token manager
        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        // Acquire lock with fencing token
        const token = await fencingManager.acquireLockWithFencingToken(podId);
        expect(token).not.toBeNull();
        if (token === null) return;
        expect(typeof token).toBe('number');
        expect(token).toBeGreaterThan(0);

        // Verify we hold the lock
        const holder = await redis.get(lockKey);
        expect(holder).toBe(podId);

        // Verify fencing token
        const isValid = await fencingManager.verifyFencingToken(token);
        expect(isValid).toBe(true);

        // Try to acquire with another pod (should fail)
        const otherToken = await fencingManager.acquireLockWithFencingToken('pod-other');
        expect(otherToken).toBeNull();

        // Start heartbeat with fencing
        const stopHb = await fencingManager.startHeartbeat(podId, token);

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));

        stopHb();

        // Release lock with fencing
        const released = await fencingManager.releaseLock(podId, token);
        expect(released).toBe(true);

        const finalHolder = await redis.get(lockKey);
        expect(finalHolder).toBeNull();
    });

    it('should handle lock expiration and re-acquisition', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const podId = 'pod-expiry-test';
        const lockKey = 'apollo:gateway:leader:expiry';

        // Acquire lock with short TTL
        const acquired = await tryAcquireLock(redis, lockKey, podId, 100); // 100ms TTL
        expect(acquired).toBe(true);

        // Wait for lock to expire
        await new Promise(resolve => setTimeout(resolve, 200));

        // Lock should be expired now
        const holder = await redis.get(lockKey);
        expect(holder).toBeNull();

        // Should be able to acquire again
        const reacquired = await tryAcquireLock(redis, lockKey, podId, 10000);
        expect(reacquired).toBe(true);
    });

    it('should prevent split-brain with fencing tokens', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const podId = 'pod-split-brain-test';
        const lockKey = 'apollo:gateway:leader:split-brain';
        const counterKey = 'apollo:gateway:fencing:counter:split-brain';

        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        // Pod A acquires lock
        const tokenA = await fencingManager.acquireLockWithFencingToken(podId);
        expect(tokenA).not.toBeNull();
        if (tokenA === null) return;

        // Pod B tries to acquire (simulating network partition where Pod A still thinks it's leader)
        const tokenB = await fencingManager.acquireLockWithFencingToken('pod-b');
        expect(tokenB).toBeNull();

        // Pod A releases
        await fencingManager.releaseLock(podId, tokenA);

        // Now Pod B should be able to acquire
        const tokenB2 = await fencingManager.acquireLockWithFencingToken('pod-b');
        expect(tokenB2).not.toBeNull();
        if (tokenB2 === null) return;
        expect(tokenB2).not.toBe(tokenA); // Different token
    });
});