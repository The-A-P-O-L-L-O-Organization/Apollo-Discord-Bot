# src/gateway/

## Responsibility
Implements distributed leader election for the bot gateway using Redis to ensure only one pod processes gateway events at a time.

## Design
Uses Redis SET command with NX/PX flags for lock acquisition, a Lua script for atomic lock release, and a periodic heartbeat to refresh lock TTL. Exposes tryAcquireLock, releaseLock, startHeartbeat, and stopHeartbeat functions.

## Flow
On pod startup, tryAcquireLock is called with a unique podId. If successful, startHeartbeat begins refreshing the lock every third of the TTL. On shutdown or loss of lock, releaseLock is called to delete the key if still owned, and stopHeartbeat clears the refresh interval. The lock key is 'apollo:gateway:leader'.

## Integration
Depends on a Redis client instance passed to each function. Consumed by the bot's gateway initialization logic to coordinate leader election across multiple pods. No direct hooks or events; integration is via direct function calls.