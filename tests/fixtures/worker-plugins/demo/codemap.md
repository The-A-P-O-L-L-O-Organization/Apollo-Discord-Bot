# tests/fixtures/worker-plugins/demo/

## Responsibility
Minimal worker plugin fixture that verifies event handling and command round-trips through the sandboxed worker host.

## Files

| File | Purpose |
|------|---------|
| `plugin.js` | Minimal DemoPlugin fixture storing last message and echoing commands |
| `plugin.json` | Declares demo plugin identity and required capabilities |

## Design
- `plugin.js` exports a `DemoPlugin` class with static `id` of `demo`, a `host` reference, and `lastMessage` state holding the most recent payload.
- Lifecycle surface is `onLoad`, `onEvent`, and `onCommand` matching the worker plugin interface.
- `plugin.json` declares identity and required capabilities without extra metadata.
- Patterns: Test Double - Stub (`DemoPlugin` echoes commands and stores the last event payload for assertions).

## Flow
1. Host loads the plugin and calls `onLoad`.
2. Host invokes `onEvent` with a payload; when `event` equals `events:messageCreate`, the payload data is stored in `lastMessage`.
3. Host invokes `onCommand` with a command payload and receives `{ ok: true, echoed: payload.name }`.
4. Tests assert stored event state and echoed command responses.

## Integration
- Declares capabilities `events:messageCreate` and `api:sendMessage` in `plugin.json`.
- Spawned via the parent `child-entry.ts` harness with `PLUGIN_DIR` set to this directory.
- Exercises `src/core/worker/workerHost.ts` and `workerChild.ts` message paths; no external modules are imported.
