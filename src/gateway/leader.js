const LOCK_KEY = 'apollo:gateway:leader';

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

let _lockTimer = null;

export async function tryAcquireLock(redis, podId, ttlMs = 10000) {
  const result = await redis.set(LOCK_KEY, podId, 'NX', 'PX', ttlMs);
  return result === 'OK';
}

export async function releaseLock(redis, podId) {
  await redis.eval(RELEASE_SCRIPT, 1, LOCK_KEY, podId);
}

export async function startHeartbeat(redis, podId, ttlMs = 10000) {
  const refresh = async () => {
    try {
      await redis.set(LOCK_KEY, podId, 'XX', 'PX', ttlMs);
    } catch (err) {
      console.error('[Leader] Heartbeat failed:', err.message);
    }
  };
  _lockTimer = setInterval(refresh, ttlMs / 3);
  return () => clearInterval(_lockTimer);
}

export function stopHeartbeat() {
  if (_lockTimer) {
    clearInterval(_lockTimer);
    _lockTimer = null;
  }
}
