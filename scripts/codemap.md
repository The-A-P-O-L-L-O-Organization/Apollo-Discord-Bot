# scripts/

## Responsibility
Maintenance and build scripts for the TypeScript repo. Covers slash-command registration, plugin manifest generation, locale linting, discord.js auditing, NSFW model tooling, and shell analysis helpers.

## Files

| File | Purpose |
|---|---|
| `deploy-commands.ts` | Registers slash commands with Discord (guild or global, with dry-run and locale checks). |
| `generate-manifest.mjs` | Hashes plugin files with SHA-256 into `plugin-manifest.json`. |
| `lint-locales.mjs` | Validates locale completeness, placeholders, plurals, and cross-locale parity. |
| `audit-discordjs.mjs` | Scans sources for discord.js v15-incompatible API usage. |
| `nsfw_tf_oracle.py` | Rebuilds the NSFWJS Keras model to produce reference predictions for fidelity tests. |
| `convert_nsfw_direct.py` | Converts the NSFWJS TensorFlow.js model to ONNX via Keras reconstruction. |
| `verify_onnx.py` | Verifies ONNX model structure and runs an inference smoke test. |
| `extract_from_bundle.py` | Extracts the embedded NSFWJS model JSON from the minified bundle. |
| `churn-analysis.sh` | Generates a git churn report into `docs/architecture/churn-report.md`. |

## Design
- TypeScript scripts run via tsx: `scripts/deploy-commands.ts` for Discord registration, invoked by `pnpm deploy-commands`.
- ESM JavaScript helpers run via node: `scripts/generate-manifest.mjs` (SHA-256 hashes to `plugin-manifest.json`, invoked by `pnpm manifest`), `scripts/lint-locales.mjs` with `scripts/lint-locales.d.mts` types (invoked by `pnpm lint:locales`), `scripts/audit-discordjs.mjs` for v15 audit support.
- Python and shell utilities are task-scoped: `scripts/nsfw_tf_oracle.py`, `scripts/convert_nsfw_direct.py`, `scripts/verify_onnx.py`, `scripts/extract_from_bundle.py` for NSFW model conversion and verification, `scripts/churn-analysis.sh` for repository churn analysis.
- All deploy and manifest scripts use explicit exit codes for CI, validate environment before network calls, and use the pino logger from `src/utils/logger.ts` where runtime logging is needed.
- Patterns: none — task-scoped procedural scripts with no named patterns of their own.

## Flow
1. `scripts/deploy-commands.ts`: parse `--guild`, `--global`, `--dry-run`, `--clear`, `--json`, `--check-locales`, `--help`, load env, require `DISCORD_TOKEN` plus `CLIENT_ID`, scan `src/plugins/*/commands/` for TypeScript command modules, extract and validate SlashCommandBuilder data with localized payloads via `src/i18n/commandPayload.ts`, then deploy through Discord REST (guild-scoped when `GUILD_ID` or `--guild` is set, otherwise global) or report dry-run output.
2. `scripts/generate-manifest.mjs`: walk `src/plugins/`, hash each file with SHA-256, write the path-to-hash map to `plugin-manifest.json` for integrity verification.
3. `scripts/lint-locales.mjs`: validate `en-US` completeness, placeholder preservation, plural suffixes, and cross-locale parity without editing snapshots.
4. Model and audit scripts run on demand for NSFW fidelity checks and discord.js version analysis, independent of bot startup.

## Integration
- `scripts/deploy-commands.ts` depends on `@discordjs/rest`, `discord.js`, `src/config/config.ts`, `src/utils/logger.ts`, and `src/i18n/commandPayload.ts`, and writes to the Discord API, consumed during development and release via `pnpm deploy-commands`.
- `scripts/generate-manifest.mjs` depends only on `node:crypto`, `node:fs`, and `node:path`, consumed by build and deploy pipelines plus CI manifest drift checks.
- Locale, audit, NSFW, and churn scripts integrate with `src/i18n/<locale>/`, `docs/discordjs-v15-audit.md`, and model artifacts, never with runtime queue, database, or gateway paths.
