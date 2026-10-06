# tests/fixtures/

## Responsibility
Holds static test data and runnable plugin fixtures for Vitest suites, kept read-only and isolated from development or production state.

## Files

No top-level source files; this directory holds static fixture subdirectories.

Subdirectories: `nsfw/` (3 PNG classifier inputs), `worker-plugins/` (sandboxed worker fixtures), `test-plugins/` (empty).

## Design
- Plain data plus minimal executable fixtures: `nsfw/` image inputs (`solid-white-300.png`, `solid-black-300.png`, `png-transparency-demo.png`) for classifier tests and `worker-plugins/` for sandboxed worker tests.
- No behavioral logic in data fixtures; executable fixtures use the smallest plugin surface that exercises the host.
- Tests use isolated temporary databases provisioned by `tests/setup.ts`; fixtures never touch development or production data.
- Patterns: Fixture (read-only static inputs plus minimal executable plugins exercising the host).

## Flow
1. Test file imports or loads a fixture by relative path.
2. Image fixtures are passed to NSFW analysis paths as deterministic inputs.
3. Worker fixtures are spawned as child processes with `PLUGIN_DIR` set, communicating over IPC.
4. Assertions compare outputs against expected snapshots or status shapes; fixtures remain unmutated across runs.

## Integration
- Consumed by `tests/**/*.test.ts`, approximately 162 files run under Vitest with `tests/setup.ts` providing migrations, i18n init, and mock lifecycle.
- Subdirectories document their own contracts: `worker-plugins/codemap.md` and `worker-plugins/demo/codemap.md`.
- No production code depends on this directory.
