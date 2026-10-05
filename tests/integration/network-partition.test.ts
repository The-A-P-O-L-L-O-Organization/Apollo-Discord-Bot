import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { createFencingTokenManager } from '../../src/gateway/leader.js';

const _Redis = Redis as unknown as new (options?: any) => RedisType;

describe('Network Partition Prevention (Fencing)', () => {
    let masterContainer: StartedTestContainer | null = null;
    let sentinelContainer: StartedTestContainer | null = null;
    let sentinelPort: number;
    let masterPort: number;
    let sentinelHost: string;
    let redis: RedisType | null = null;
    let fencingManager: Awaited<ReturnType<typeof createFencingTokenManager>> | null = null;

    beforeAll(async () => {
        try {
            // Start master Redis
            masterContainer = await new GenericContainer('redis:8-alpine')
                .withCommand(['redis-server', '--appendonly', 'yes'])
                .withExposedPorts(6379)
                .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
                .start();

            masterPort = masterContainer.getMappedPort(6379);
            sentinelHost = masterContainer.getHost();

            // Start Sentinel
            sentinelContainer = await new GenericContainer('redis:8-alpine')
                .withCommand(['redis-sentinel', '/etc/redis/sentinel.conf'])
                .withExposedPorts(26379)
                .withWaitStrategy(Wait.forLogMessage('Sentinel runid'))
                .withStartupTimeout(60000)
                .start();

            sentinelPort = sentinelContainer.getMappedPort(26379);

            console.log(`Network partition test - Sentinel: ${sentinelHost}:${sentinelPort}, Master: ${sentinelHost}:${masterPort}`);

        } catch (err) {
            console.log('Docker not available, skipping network partition tests:', (err as Error).message);
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

        const client = new _Redis({
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

        await client.connect();
        expect(client.status).toBe('ready');
        redis = client;
    });

    afterEach(async () => {
        if (redis) {
            await redis.quit();
            redis = null;
        }
        if (fencingManager) {
            await fencingManager.close();
            fencingManager = null;
        }
    });

    it('should prevent dual leadership during network partition using fencing tokens', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const lockKey = 'apollo:gateway:leader:partition';
        const counterKey = 'apollo:gateway:fencing:counter:partition';

        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        // Pod A acquires lock with fencing token
        const tokenA = await fencingManager.acquireLockWithFencingToken('pod-a');
        expect(tokenA).not.toBeNull();
        if (tokenA === null) return;

        // Verify Pod A holds the lock
        let holder = await redis.get(lockKey);
        expect(holder).toBe('pod-a');

        // Simulate network partition: Pod A's connection drops but it still thinks it's leader
        // Pod B tries to acquire lock (simulating new election after partition)
        // In a real partition, Sentinel would promote replica, but the fencing token prevents dual leadership
        const tokenB = await fencingManager.acquireLockWithFencingToken('pod-b');

        // With fencing, Pod B should NOT be able to acquire because Pod A still holds the lock
        // The lock hasn't expired yet
        expect(tokenB).toBeNull();

        // Pod A releases (simulating it realizes it lost the partition)
        await fencingManager.releaseLock('pod-a', tokenA);

        // Now Pod B can acquire with a new, higher fencing token
        const tokenB2 = await fencingManager.acquireLockWithFencingToken('pod-b');
        expect(tokenB2).not.toBeNull();
        if (tokenB2 === null) return;
        expect(tokenB2).toBeGreaterThan(tokenA); // Token monotonically increases

        // Verify Pod B now holds the lock
        holder = await redis.get(lockKey);
        expect(holder).toBe('pod-b');
    });

    it('should reject stale fencing tokens after partition heals', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const lockKey = 'apollo:gateway:leader:stale-token';
        const counterKey = 'apollo:gateway:fencing:counter:stale-token';

        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        // Pod A acquires
        const tokenA = await fencingManager.acquireLockWithFencingToken('pod-a');
        expect(tokenA).not.toBeNull();
        if (tokenA === null) return;

        // Pod A releases
        await fencingManager.releaseLock('pod-a', tokenA);

        // Pod B acquires (gets new token)
        const tokenB = await fencingManager.acquireLockWithFencingToken('pod-b');
        expect(tokenB).not.toBeNull();
        if (tokenB === null) return;
        expect(tokenB).toBeGreaterThan(tokenA);

        // Simulate Pod A trying to use stale token after partition heals
        // This should fail because tokenA is no longer valid
        const isValidA = await fencingManager.verifyFencingToken(tokenA);
        expect(isValidA).toBe(false);

        // Pod B's token should be valid
        const isValidB = await fencingManager.verifyFencingToken(tokenB);
        expect(isValidB).toBe(true);

        // Pod A tries to release with stale token - should fail
        const released = await fencingManager.releaseLock('pod-a', tokenA);
        expect(released).toBe(false);

        // Pod B releases with valid token - should succeed
        const releasedB = await fencingManager.releaseLock('pod-b', tokenB);
        expect(releasedB).toBe(true);
    });

    it('should handle concurrent lock attempts during partition', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const lockKey = 'apollo:gateway:leader:concurrent';
        const counterKey = 'apollo:gateway:fencing:counter:concurrent';

        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        // Simulate multiple pods trying to acquire simultaneously
        const results = await Promise.all([
            fencingManager.acquireLockWithFencingToken('pod-1'),
            fencingManager.acquireLockWithFencingToken('pod-2'),
            fencingManager.acquireLockWithFencingToken('pod-3'),
            fencingManager.acquireLockWithFencingToken('pod-4'),
            fencingManager.acquireLockWithFencingToken('pod-5'),
        ]);

        // Exactly one should succeed
        const successful = results.filter((r): r is number => r !== null);
        expect(successful.length).toBe(1);
        expect(successful[0]).toBeGreaterThan(0);

        // Verify only one holds the lock
        const holder = await redis.get(lockKey);
        expect(holder).not.toBeNull();

        // Release the winner's lock
        const winnerToken = successful[0];
        const winnerPod = results.findIndex((r): r is number => r === winnerToken) + 1;
        await fencingManager.releaseLock(`pod-${winnerPod}`, winnerToken);

        // Now others can try again
        const results2 = await Promise.all([
            fencingManager.acquireLockWithFencingToken('pod-1'),
            fencingManager.acquireLockWithFencingToken('pod-2'),
            fencingManager.acquireLockWithFencingToken('pod-3'),
            fencingManager.acquireLockWithFencingToken('pod-4'),
            fencingManager.acquireLockWithFencingToken('pod-5'),
        ]);

        const successful2 = results2.filter((r): r is number => r !== null);
        expect(successful2.length).toBe(1);
        const secondToken = successful2[0];
        if (secondToken !== undefined) {
            expect(secondToken).toBeGreaterThan(winnerToken); // Token increased
        }
    });

    it('should maintain fencing token monotonicity across restarts', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const lockKey = 'apollo:gateway:leader:monotonic';
        const counterKey = 'apollo:gateway:fencing:counter:monotonic';

        // First manager
        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        const token1 = await fencingManager.acquireLockWithFencingToken('pod-1');
        expect(token1).not.toBeNull();
        if (token1 === null) return;
        await fencingManager.releaseLock('pod-1', token1);

        const token2 = await fencingManager.acquireLockWithFencingToken('pod-2');
        expect(token2).not.toBeNull();
        if (token2 === null) return;
        expect(token2).toBeGreaterThan(token1);
        await fencingManager.releaseLock('pod-2', token2);

        // Simulate manager restart (new instance)
        await fencingManager.close();

        fencingManager = await createFencingTokenManager(redis, lockKey, 10000, counterKey);

        const token3 = await fencingManager.acquireLockWithFencingToken('pod-3');
        expect(token3).not.toBeNull();
        if (token3 === null) return;
        expect(token3).toBeGreaterThan(token2); // Counter persists in Redis
    });

    it('should handle heartbeat failure during partition', async () => {
        if (!redis) {
            console.log('Skipping: Redis not connected');
            return;
        }

        const lockKey = 'apollo:gateway:leader:heartbeat-fail';
        const counterKey = 'apollo:gateway:fencing:counter:heartbeat-fail';

        fencingManager = await createFencingTokenManager(redis, lockKey, 100, counterKey); // Very short TTL

        const token = await fencingManager.acquireLockWithFencingToken('pod-heartbeat');
        expect(token).not.toBeNull();
        if (token === null) return;

        // Start heartbeat
        const stopHb = await fencingManager.startHeartbeat('pod-heartbeat', token);

        // Wait for TTL to expire (simulating partition where heartbeat can't reach Redis)
        await new Promise(resolve => setTimeout(resolve, 200));

        // Heartbeat should fail and stop
        // The lock should be expired now
        const holder = await redis.get(lockKey);
        expect(holder).toBeNull();

        // Fencing token should no longer be valid
        const isValid = await fencingManager.verifyFencingToken(token);
        expect(isValid).toBe(false);

        stopHb();
    });
});