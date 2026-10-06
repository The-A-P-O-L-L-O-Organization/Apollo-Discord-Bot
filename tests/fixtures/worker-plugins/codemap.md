# tests/fixtures/worker-plugins/

## Responsibility
Provides the child-process entry point used to exercise sandboxed worker plugin loading in tests.

## Files

| File | Purpose |
|------|---------|
| `child-entry.ts` | Vitest TypeScript entry delegating to runChild with PLUGIN_DIR |
| `child-entry.js` | Plain Node entry delegating to runChild with PLUGIN_DIR |

Subdirectory: `demo/` (demo plugin fixture).

## Design
- Dual entry files `child-entry.ts` for Vitest execution and `child-entry.js` for plain Node spawning, both delegating to `runChild` from `src/core/worker/workerChild.ts`.
- Plugin directory is supplied exclusively through the `PLUGIN_DIR` environment variable.
- Thin wrapper with no plugin logic; demo behavior lives in the `demo/` subdirectory.
- Patterns: Adapter (thin entries adapt `runChild` to Vitest and plain Node spawning via `PLUGIN_DIR`).

## Flow
1. Test harness spawns the entry with `PLUGIN_DIR` pointing at the fixture under test.
2. Entry calls `runChild` with the plugin directory and process environment.
3. Entry registers a `message` listener on `process` and forwards each IPC message to `child.handleMessage` as an `RPCMessage`.
4. Startup failure is logged and the process exits with code 1.

## Integration
- Depends on `src/core/worker/workerChild.ts` for `runChild` and `src/core/worker/rpc.ts` for the `RPCMessage` type.
- Consumed by worker host and lifecycle tests that verify message delegation, load failure, and isolation.
- Demo plugin contract is documented in `demo/codemap.md`.
