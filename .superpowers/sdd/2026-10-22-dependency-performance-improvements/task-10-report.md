# Task 10 Report: Admin Authentication and HTTP Diagnostics

## Summary

Replaced Bull Board's spoofable `X-User-ID` authentication with bearer credentials configured as comma-separated `userId=token` entries in `ADMIN_AUTH_TOKENS`. Tokens are compared using fixed-length SHA-256 digests and constant-time comparison; authenticated users are authorized separately through `OWNER_IDS`, yielding `401` for missing or invalid credentials and `403` for authenticated non-owners.

Added `pino-http` diagnostics to the health and GitHub webhook servers with bounded request IDs, normalized route paths, status/duration logging, and redaction of authorization, cookies, API keys, and webhook signatures. Request bodies are not logged.

## Verification

- `pnpm vitest run tests/admin/bullboard-auth.test.ts tests/utils/integrationWebhook.test.ts tests/utils/startupChecks.test.ts tests/utils/healthServer.test.ts`: passed, 3 files and 34 tests (the repository has no `tests/utils/healthServer.test.ts` file).
- `pnpm lint --quiet`: passed.
- `pnpm build`: passed.
- `git diff --check`: passed.
- `pnpm exec tsc --noEmit --pretty false`: not rerun; the repository-wide command remains blocked by the established unrelated generated and test type errors.

## Configuration

Production startup now requires `ADMIN_AUTH_TOKENS`. Use `ADMIN_AUTH_TOKENS=userId=token[,userId=token...]` and list the authorized user IDs in `OWNER_IDS`.
