 
import { config } from '../config/config.js';
import { getRedis } from './redis.js';

const LOCK_PREFIX = 'apollo:lock:';

let _lockRedis = null;

export async function getLockRedis() {
    if (_lockRedis) {return _lockRedis;}
    if (!config.queue.enabled) {return null;}
    _lockRedis = getRedis('lock');
    await _lockRedis.connect();
    return _lockRedis;
}

export async function closeLockRedis() {
    if (_lockRedis) {
        await _lockRedis.quit();
        _lockRedis = null;
    }
}

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export async function acquireLock(redis, key, owner, ttlMs = 10000) {
    const result = await redis.set(`${LOCK_PREFIX}${key}`, owner, 'NX', 'PX', ttlMs);
    return result === 'OK';
}

export async function releaseLock(redis, key, owner) {
    await redis.eval(RELEASE_SCRIPT, 1, `${LOCK_PREFIX}${key}`, owner);
}

export async function withLock(redis, key, owner, fn, ttlMs = 10000) {
    const acquired = await acquireLock(redis, key, owner, ttlMs);
    if (!acquired) {return false;}
    try {
        return await fn();
    } finally {
        await releaseLock(redis, key, owner);
    }
}
