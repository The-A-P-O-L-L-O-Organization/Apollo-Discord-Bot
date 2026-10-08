# Discord.js v15 Migration Plan (Deferred)

## Status: DEFERRED

This migration is intentionally deferred. The current v14 implementation is stable, maintained, and meets all operational requirements. Migration will be reconsidered when:

- Discord.js v15 reaches LTS stability
- A concrete feature or security requirement necessitates the upgrade
- The ecosystem (plugins, tooling, types) has fully migrated

## Current Compatibility Status

- **Discord.js version:** 14.27.0 (pinned via pnpm catalog)
- **Gateway intents:** All v14 intents supported
- **Slash commands:** v14 builder API used throughout
- **Voice:** Built-in VoiceManager (no @discordjs/voice dependency)
- **REST:** @discordjs/rest v2.6.3 (compatible with v14)
- **Builders:** @discordjs/builders v1.14.1 (compatible with v14)

## Known v15 Breaking Changes (from audit)

Per `docs/discordjs-v15-audit.md`, the following would require changes:

1. **Removed deprecated classes** — `TextChannel`, `DMChannel`, `NewsChannel`, `ThreadChannel` replaced by `ChannelType` checks
2. **Permission system overhaul** — `PermissionsBitField` API changes
3. **Message component interactions** — Custom ID handling changes
4. **Webhook client** — Constructor signature changes
5. **Application command permissions** — New API structure
6. **Voice state updates** — Event payload changes
7. **Guild scheduled events** — New event types

## Migration Checklist (for future reference)

When migration is triggered:

- [ ] Update `discord.js`, `@discordjs/rest`, `@discordjs/builders` to v15 in pnpm catalog
- [ ] Run codemod if provided by Discord.js team
- [ ] Update all channel type checks (`channel.type === ChannelType.GuildText` etc.)
- [ ] Update permission checks to new `PermissionsBitField` API
- [ ] Update webhook client instantiation
- [ ] Update application command permission handling
- [ ] Update voice state event handlers
- [ ] Run full test suite (163 test files, 1842 tests)
- [ ] Run integration tests against Discord API (staging)
- [ ] Update `docs/discordjs-v15-audit.md` with resolution status

## Rollback Plan

If migration is attempted and fails:
1. Revert pnpm catalog versions to v14
2. `pnpm install`
3. `pnpm build` and `pnpm test` to verify stability
4. Document blockers in this file for future attempts

## Decision Log

- **2026-10-08:** Migration deferred. Stack improvement plan (16 tasks) prioritized over framework upgrade. v14 receives security patches and is API-stable for our use case.