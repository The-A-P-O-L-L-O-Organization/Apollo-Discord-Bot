# Contributing to Apollo Discord Bot

Thank you for contributing. Apollo is a TypeScript monorepo-style bot with strict linting, generated protobuf clients, multi-language support, and multi-runtime CI covering Node, Rust, and Go. This guide explains how to set up, change code safely, test thoroughly, and submit a review-ready pull request.

## Table of Contents

- [1. Ways to Contribute](#1-ways-to-contribute)
- [2. Development Environment](#2-development-environment)
- [3. Repository Tour](#3-repository-tour)
- [4. Branching and Commits](#4-branching-and-commits)
- [5. TypeScript and Style Rules](#5-typescript-and-style-rules)
- [6. Plugin and Command Authoring](#6-plugin-and-command-authoring)
- [7. Database Changes](#7-database-changes)
- [8. Internationalization](#8-internationalization)
- [9. Protobuf Changes](#9-protobuf-changes)
- [10. Testing](#10-testing)
- [11. Verification Gates](#11-verification-gates)
- [12. Pull Request Process](#12-pull-request-process)
- [13. Multi-Instance and Performance Reviews](#13-multi-instance-and-performance-reviews)
- [14. Documentation Expectations](#14-documentation-expectations)
- [15. Community Guidelines](#15-community-guidelines)

## 1. Ways to Contribute

- Fix bugs with regression tests
- Add commands, events, plugin APIs, CLI operations, or scheduled jobs
- Improve automod precision, ticket workflows, analytics, logging, or accessibility of responses
- Expand translations for supported locales
- Harden security, error handling, rate limiting, and audit trails
- Improve performance, memory behavior, queue throughput, or database access patterns
- Maintain docs, codemaps, runbooks, architecture notes, and examples
- Improve CI, Docker images, Compose profiles, protobuf workflows, or developer scripts
- Triage issues with reproduction steps, logs, versions, and configuration details

For bugs, include expected versus actual behavior, reproduction commands, relevant slash command names, `NODE_ENV`, `RUN_MODE`, `DB_TYPE`, queue status, and redacted logs. For features, describe use cases, affected plugins, command shapes, permissions, persistence needs, multi-instance impact, and locale impact.

## 2. Development Environment

### Prerequisites

- Node.js 26 or later
- pnpm 11 or later
- Git
- Docker and Docker Compose for infrastructure-dependent work
- Optional: Rust 1.88 for NSFW components, Go toolchain for `services/interlink`, `buf` plus `protoc` for protobuf regeneration
- Recommended: VS Code with TypeScript, ESLint, and Vitest extensions

### Setup

```bash
git clone https://github.com/YOUR-USERNAME/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
git remote add upstream https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
pnpm install
cp .env.example .env
```

Populate development `.env` values:

```env
DISCORD_TOKEN=your-development-bot-token
CLIENT_ID=your-development-client-id
OWNER_IDS=your-discord-user-id
ENCRYPTION_KEY=development-only-base64-key
OPERATOR_AGREEMENT=true
OPERATOR_CONTACT=Discord: @you
GUILD_ID=your-test-guild-id
```

### Daily commands

```bash
pnpm dev                 # Gateway with live reload
RUN_MODE=worker pnpm dev:worker
pnpm test                # Full Vitest suite
pnpm test:watch          # Watch mode
pnpm lint                # ESLint over src/**/*.ts
pnpm typecheck           # Strict TypeScript check
pnpm lint:locales        # Translation parity gate
pnpm build               # Emit dist/
pnpm run deploy:commands # Register development guild commands
```

Keep `GUILD_ID` set locally so command registration propagates instantly. Never use production tokens, production databases, or production Redis from development branches.

## 3. Repository Tour

```text
bin/apollo.ts            CLI entry
scripts/deploy-commands.ts, generate-manifest.mjs, lint-locales.mjs
protos/interlink, protos/nsfw
services/interlink/      Go relay
src/index.ts             Gateway boot, client, PluginManager, EventBus
src/worker.ts            Queue consumer boot
src/shard.ts             Sharding launcher
src/cli/                 Argument parsing, discovery, formatting, socket RPC
src/config/config.ts     Environment-derived ApolloConfig
src/core/                Plugin base, manager, registry, installer, loader,
                         enabler/disabler, reloader, CommandSync, dependencies
src/core/worker/         Sandbox host/child and capability RPC schemas
src/db/                  Knex factory, adapter, migrations
src/gateway/             Leader election and fencing
src/generated/           Checked-in buf output; do not hand-edit
src/i18n/                Service, cache, watchers, dictionaries
src/observability/       OpenTelemetry bootstrap
src/plugins/             admin, automod, integrations, interlink,
                         moderation, tickets, utility
src/queue/               BullMQ factory, serializers, metrics, job handlers
src/types/               Shared TypeScript contracts
src/utils/               Cross-cutting services and schedulers
tests/                   Vitest suites, mocks, fixtures, setup
docs/                    Architecture, i18n, runbooks
legal/                   Binding operator documents
```

Read the root `codemap.md`, then the `codemap.md` nearest your change. If behavior changes directory responsibilities, update those codemaps in the same pull request.

## 4. Branching and Commits

Create focused branches from `main`:

```bash
git checkout main
git pull upstream main
git checkout -b feature/descriptive-name
```

Branch prefixes:

- `feature/` for new functionality and plugins
- `bugfix/` for fixes
- `hotfix/` for urgent production corrections
- `docs/` for documentation-only changes
- `refactor/` for behavior-preserving restructuring
- `locale/` for translation-only changes
- `chore/` for tooling, CI, and dependency maintenance

Commit guidance:

- Small, reviewable commits with imperative subjects
- No emojis in commits, code, or docs
- No secrets, tokens, database URLs, private guild IDs, or user data
- Reference issue numbers in bodies where applicable
- Update `plugin-manifest.json` in a separate, clearly labeled commit when integrity hashes change

## 5. TypeScript and Style Rules

Apollo uses strict TypeScript with type-checked ESLint. The gates are non-negotiable.

### Language rules

- ESM only. Use `import` and `export`; never `require`.
- Relative TypeScript imports must use `.js` suffixes (`./config.js`), matching NodeNext resolution.
- Use `import type` for type-only imports and exports.
- `any` is forbidden in `src/`; model unknown Discord payloads with narrow types or validation.
- Handle promises explicitly; floating promises fail lint.
- Prefix intentionally unused parameters with underscore.
- Prefer `async`/`await` over promise chains.
- Wrap command execution in `try`/`catch` and return user-safe error embeds.

### Formatting

- 4-space indentation
- Single quotes
- Semicolons always
- No trailing commas
- Strict equality
- Braces for every conditional body
- Lines should remain readable near 120 characters; break long builders and option chains

### Logging

- Do not use raw `console.log`; ESLint warns on `console`.
- Use `createLogger({ component: 'your-area' })`.
- Use text tags such as `[SUCCESS]`, `[ERROR]`, `[INFO]`, `[WARN]`, `[SECURITY]`.
- Never log tokens, secrets, encryption keys, full interaction payloads, message content beyond operational need, or personal data.
- Respect `LOG_SAMPLE_RATE` semantics for high-volume paths.

### Project-specific prohibitions

- No emojis in source, tests, docs, or commit messages.
- No code comments unless explicitly requested for the task; make code self-explanatory through naming and narrow functions.
- Do not hand-edit `src/generated/`; change `.proto` files and regenerate.
- Do not bypass `src/utils/db.ts` for persistence.
- Do not introduce in-memory cross-pod state; use Redis or Postgres.

## 6. Plugin and Command Authoring

### New command checklist

1. Choose the owning plugin. Cross-cutting behavior still needs one owner.
2. Create `src/plugins/<id>/commands/<name>.ts`.
3. Export a default object with `name`, `data` (`SlashCommandBuilder`), `category`, and `execute`.
4. Declare least-privilege default permissions.
5. Localize user-facing strings through the plugin namespace.
6. Add tests under `tests/` mirroring plugin and command names.
7. Run guild-scoped command deployment.
8. Update README command tables and relevant codemaps when user-visible behavior changes.

Example command:

```ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default {
    name: 'example',
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('An example command')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'Utility',
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            await interaction.reply({ content: 'Done!' });
        } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
        }
    }
};
```

### New plugin checklist

1. Create `src/plugins/<id>/plugin.ts` extending `Plugin`.
2. Implement `onLoad`, `onEnable`, `onDisable`, and `onUnload` as applicable.
3. Place commands, events, CLI specs, locales, and plugin-owned utilities under the plugin directory.
4. Declare dependencies through the dependency resolver rather than import-time side effects.
5. Provide EventBus APIs under `<plugin>:<action>` naming and document payloads.
6. Register socket handlers only for operator-safe actions and validate authentication.
7. Add plugin tests, locale files, README coverage, codemaps, and manifest updates.

### EventBus conventions

- Event names use `<plugin>:<past-tense-action>`, for example `tickets:closed`.
- API names use `<plugin>:<verb><Subject>`, for example `moderation:getWarnings`.
- State keys use `<plugin>:<subject>`, for example `automod:filters`.
- Remove listeners, unprovide APIs, clear timers, and close subscriptions on unload.
- Validate cross-plugin inputs at trust boundaries even when callers are first-party.

### Sandboxed plugin considerations

Third-party worker plugins may only use declared capabilities. Do not grant filesystem, network, process, or raw Discord token access unless the capability model explicitly supports and documents it. Keep RPC schemas versioned and backwards compatible where possible.

## 7. Database Changes

All persistence goes through `src/utils/db.ts`.

```ts
import { getGuildData, updateGuildData } from '../../../utils/db.js';

const data = await getGuildData('my-store', guildId);
await updateGuildData('my-store', guildId, (current) => {
    current.counter = (current.counter ?? 0) + 1;
    return current;
});
```

Rules:

- Always `await` database helpers.
- Prefer atomic `updateGuildData` over separate get/set sequences.
- Add Knex migrations as `.cjs` files in `src/db/migrations/` with reversible `up` and `down` paths.
- Test migrations against both SQLite and Postgres when schema affects shared tables.
- Never store tokens, secrets, plaintext PII beyond operational need, or unencrypted sensitive fields outside the encryption helpers.
- Document retention, deletion, and export behavior for user-affected data; `/datadeletion` and analytics paths are sensitive.

## 8. Internationalization

Translator rules are binding and enforced by `pnpm lint:locales`.

- `en-US` is canonical. Add every key there first.
- Namespace equals plugin id. Shared strings belong to `common`.
- First-party locales live at `src/plugins/<id>/locales/<BCP47>/common.json`.
- Core dictionaries live in `src/i18n/dictionaries/`.
- Placeholders use `{{variable}}` exactly; mismatched sets fail CI.
- Plurals require `_one` and `_other` at minimum; mirror every requested suffix.
- Resolve locale per execution, then bind a fixed `t`; never share translators across interactions.
- Do not load namespaces per command; namespaces load once at plugin enable time.
- Use informal German `du`, not formal `Sie`, unless quoting policy text.

Locale-only PRs must touch only JSON dictionaries and must pass `pnpm lint:locales`. Do not run `pnpm manifest` for locale-only changes; locale files are excluded from integrity hashes.

## 9. Protobuf Changes

Schemas:

- `protos/interlink/v1/interlink.proto`
- `protos/nsfw/v1/nsfw.proto`

Generated TypeScript clients live under `src/generated/` and Go code is consumed by `services/interlink/`.

Workflow:

```bash
pnpm proto:lint
pnpm proto:generate
pnpm proto:generate:go
pnpm proto:generate:ts
pnpm proto:breaking
```

Rules:

- Treat schema changes as API changes; preserve backwards compatibility unless a breaking change is explicitly approved.
- Run breaking-change detection against `main`.
- Commit both schema and regenerated outputs together.
- Update relay, bot client, tests, and docs in the same PR when behavior changes.
- Verify Go and Rust consumers build after TS-side schema edits.

## 10. Testing

Apollo uses Vitest with forked isolation, mocked Discord objects, and Redis testcontainers for integration coverage.

### Commands to know

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:ui
pnpm test -- tests/plugins/moderation/ban.test.ts
```

### Test structure

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import myCommand from '../../../src/plugins/moderation/commands/mycommand.js';
import { createMockInteraction } from '../../mocks/discord.js';

vi.mock('../../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    updateGuildData: vi.fn((store: string, guildId: string, updater: (v: { nextCaseId: number }) => unknown) =>
        Promise.resolve(updater({ nextCaseId: 1 })))
}));

describe('MyCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exposes expected metadata', () => {
        expect(myCommand.name).toBe('mycommand');
    });

    it('replies on success', async () => {
        const interaction = createMockInteraction();
        await myCommand.execute(interaction);
        expect(interaction.reply).toHaveBeenCalled();
    });
});
```

### Coverage expectations

- New commands: metadata, success, permission denial, validation failure, error handling, and important edge cases
- New events: valid payload, malformed payload, missing guild/member/channel, and error paths
- New utilities: every exported function, success and failure branches, timeout and retry behavior
- Bug fixes: failing-first regression test proving the reported behavior
- Queue/worker changes: serialization round-trips, retry behavior, and REST callback handling
- DB changes: SQLite and Postgres-relevant paths where applicable
- Locale changes: `pnpm lint:locales` plus rendering checks for interpolated strings

Use factories in `tests/mocks/discord.ts`. Keep tests deterministic; no live Discord calls, no public network dependencies, and no timing-sensitive assertions without fake timers or tolerance windows.

## 11. Verification Gates

Run these before requesting review:

```bash
pnpm lint
pnpm typecheck
pnpm lint:locales
pnpm test
pnpm build
```

Additional gates by change type:

| Change | Extra command |
|--------|---------------|
| Non-locale source added, moved, or deleted | `pnpm manifest` and commit updated manifest |
| Protobuf edited | `pnpm proto:lint`, `pnpm proto:generate`, `pnpm proto:breaking` |
| Go relay edited | `go build ./...`, `go test ./...` from `services/interlink` |
| Rust NSFW edited | `cargo build --release --workspace`, relevant `cargo test` |
| Docker or Compose edited | Build affected image and boot relevant profile |
| DB migration added | SQLite and Postgres migration verification |

CI also enforces security audit, CodeQL, Semgrep, buf lint, manifest drift detection, and integration tests. A PR is not ready when any required check is red.

## 12. Pull Request Process

1. Sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

2. Run all relevant verification gates.
3. Push the branch to your fork.
4. Open a PR against `main` with a clear conventional prefix:
   - `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `locale:`, `security:`
5. Complete the PR template fully, including testing evidence and change-type checklist.
6. Request review from maintainers for affected areas.
7. Address feedback with additional commits rather than rewriting shared history after review starts.
8. Keep the PR focused; unrelated refactors belong in separate PRs.

PR description template:

```markdown
## Summary
<!-- What changed and why -->

## Changes
- <!-- Specific implementation points -->

## Testing
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint:locales`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manual Discord verification with `GUILD_ID`
- [ ] Postgres verification (for DB changes)
- [ ] Redis/worker verification (for queue changes)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Translation update
```

Reviewers check correctness, security, error handling, permissions, persistence safety, multi-instance behavior, locale completeness, test quality, and documentation updates. Expect revision requests on first submissions; that is normal.

## 13. Multi-Instance and Performance Reviews

Changes affecting shared state receive extra scrutiny:

- Use atomic database updates and distributed locks for scheduled work.
- Avoid unbounded arrays, maps, or caches without TTL and eviction.
- Keep queue payloads small; pass IDs and fetch rich objects in workers.
- Make retries idempotent and safe under duplicate delivery.
- Do not assume one gateway, one worker, one timezone, or local clock precision.
- Measure hot paths before optimizing; include before/after data for performance PRs.
- Consider Redis key cardinality, TTL behavior, and lock contention.

## 14. Documentation Expectations

Update docs in the same PR as behavior changes:

- User-visible commands and workflows: `README.md` and `INSTALLATION.md`
- Contributor workflows and gates: this file
- Security behavior: `SECURITY.md`
- Agent instructions when architecture changes: `AGENTS.md`
- Directory responsibilities: relevant `codemap.md` files
- Translators: `docs/i18n.md` when conventions change
- Operators: `docs/runbooks/` when incident behavior changes

Write in plain technical English, use present tense, specify file paths with extensions, and avoid speculative future promises. If command counts or metrics may drift, describe how to obtain the current value rather than hardcoding a soon-stale number.

## 15. Community Guidelines

- Be respectful, constructive, and patient, especially with first-time contributors.
- Assume good intent; ask clarifying questions before criticizing an approach.
- Keep discussions on topic and cite code, logs, or docs when disagreeing.
- Do not post secrets, private server data, user information, or abusive content.
- Follow the Code of Conduct in `CODE_OF_CONDUCT.md`.
- Security issues must use private reporting channels described in `SECURITY.md`, never public issues or PRs.

Thank you for helping Apollo stay reliable, secure, and welcoming. Focused PRs with tests and docs are the fastest path to merge.
