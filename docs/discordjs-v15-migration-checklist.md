# discord.js v15 Migration Checklist

This checklist tracks all steps required to migrate from discord.js v14 to v15.

## Pre-Migration Phase

### Audit & Analysis
- [ ] Run API audit script: `node scripts/audit-discordjs.mjs > docs/discordjs-v15-audit.md`
- [ ] Review discord.js v15 release notes and changelog
- [ ] Document all breaking changes in `docs/discordjs-v15-known-breaking-changes.md`
- [ ] Identify deprecated APIs used in codebase (from audit)
- [ ] Map each occurrence to a migration strategy
- [ ] Create migration branch: `git checkout -b discordjs-v15-migration`

### Dependency Preparation
- [ ] Update Node.js requirement to v20+ (v15 minimum requirement)
- [ ] Update TypeScript to latest compatible version
- [ ] Update @discordjs/builders, @discordjs/rest, @discordjs/collection if needed
- [ ] Check all discord.js-related dependencies for v15 compatibility
- [ ] Pin exact versions in package.json for reproducible builds

### Testing Infrastructure
- [ ] Ensure all existing tests pass on v14 (baseline)
- [ ] Add migration-specific test cases for high-risk APIs
- [ ] Set up test matrix for Node.js 20, 22, 24
- [ ] Configure CI to run against v15 pre-releases when available

---

## Migration Phase

### Core Bot Setup (src/index.ts)
- [ ] Update Client constructor options (intents, partials, etc.)
- [ ] Update GatewayIntentBits usage
- [ ] Update Partials usage
- [ ] Update client.login() if signature changed
- [ ] Verify event handler registrations

### Type Definitions (src/types/discord.ts, src/types/*.ts)
- [ ] Update all discord.js type imports
- [ ] Fix ChatInputCommandInteraction changes
- [ ] Fix CommandInteraction changes
- [ ] Fix ButtonInteraction changes
- [ ] Fix ModalSubmitInteraction changes
- [ ] Fix MessageContextMenuCommandInteraction changes
- [ ] Fix UserContextMenuCommandInteraction changes
- [ ] Update ComponentType, ButtonStyle, ChannelType enums
- [ ] Update PermissionsBitField / PermissionFlagsBits
- [ ] Update MessageFlags usage
- [ ] Update Snowflake, Collection, Guild, GuildMember types
- [ ] Update TextChannel, VoiceChannel, ThreadChannel, etc.
- [ ] Update User, Message, Interaction, Attachment types
- [ ] Update Events enum usage
- [ ] Update REST and Routes usage

### Plugin System (src/core/PluginManager.ts, src/core/Plugin.ts)
- [ ] Update Events imports and usage
- [ ] Update Partials usage
- [ ] Update REST/Routes for command deployment

### Queue System (src/queue/*.ts)
- [ ] Update REST usage in processCommand.ts
- [ ] Update Routes usage in remoteInteraction.ts
- [ ] Update Collection usage
- [ ] Update serializeInteraction.ts types

### Commands - All Plugins
**Admin Plugin:**
- [ ] language.ts
- [ ] logging.ts
- [ ] migrate.ts
- [ ] plugin.ts
- [ ] queue.ts
- [ ] reactionrole.ts
- [ ] setlogchannel.ts
- [ ] system.ts

**Automod Plugin:**
- [ ] automod.ts
- [ ] scanMessage.ts
- [ ] messageCreate.ts (event)

**Integrations Plugin:**
- [ ] integration.ts

**Interlink Plugin:**
- [ ] interlink.ts

**Moderation Plugin:**
- [ ] autorole.ts
- [ ] ban.ts
- [ ] blacklist.ts
- [ ] case.ts
- [ ] clear.ts
- [ ] clearstrikes.ts
- [ ] clearwarnings.ts
- [ ] forceban.ts
- [ ] kick.ts
- [ ] lockdown.ts
- [ ] masskick.ts
- [ ] massmute.ts
- [ ] mute.ts
- [ ] nickname.ts
- [ ] note.ts
- [ ] purge.ts
- [ ] raidmode.ts
- [ ] reportMessage.ts
- [ ] reports.ts
- [ ] rolepersistence.ts
- [ ] slowmode.ts
- [ ] softban.ts
- [ ] strike.ts
- [ ] strikeconfig.ts
- [ ] strikes.ts
- [ ] tempban.ts
- [ ] temprole.ts
- [ ] timeout.ts
- [ ] unban.ts
- [ ] unlock.ts
- [ ] unmute.ts
- [ ] voicedeafen.ts
- [ ] voicedisconnect.ts
- [ ] voicemove.ts
- [ ] voicemute.ts
- [ ] voiceundeafen.ts
- [ ] voiceunmute.ts
- [ ] warn.ts
- [ ] warnconfig.ts
- [ ] warnings.ts
- [ ] guildMemberAdd.ts (event)
- [ ] guildMemberRemove.ts (event)

**Tickets Plugin:**
- [ ] assign.ts
- [ ] closeticket.ts
- [ ] ticket.ts
- [ ] ticketadd.ts
- [ ] ticketinfo.ts
- [ ] ticketlist.ts
- [ ] ticketpriority.ts
- [ ] ticketratings.ts
- [ ] ticketsearch.ts
- [ ] ticketsetup.ts
- [ ] ticketstats.ts
- [ ] tickettemplate.ts
- [ ] tickettransfer.ts
- [ ] interactionCreate.ts (event)
- [ ] slaMonitor.ts (event)

**Utility Plugin:**
- [ ] 8ball.ts
- [ ] analytics.ts
- [ ] announcement.ts
- [ ] apollo.ts
- [ ] apolloActions.ts
- [ ] avatar.ts
- [ ] banner.ts
- [ ] cancelreminder.ts
- [ ] channelinfo.ts
- [ ] datadeletion.ts
- [ ] embed.ts
- [ ] giveaway.ts
- [ ] help.ts
- [ ] invite.ts
- [ ] joke.ts
- [ ] leaderboard.ts
- [ ] level.ts
- [ ] operatorcontact.ts
- [ ] ping.ts
- [ ] poll.ts
- [ ] remind.ts
- [ ] reminders.ts
- [ ] report.ts
- [ ] roleinfo.ts
- [ ] roll.ts
- [ ] serverinfo.ts
- [ ] sla.ts
- [ ] stats.ts
- [ ] tag.ts
- [ ] translate.ts
- [ ] userinfo.ts
- [ ] messageCreate.ts (event)

### Utility Modules (src/utils/*.ts)
- [ ] accessControl.ts
- [ ] analyticsCollector.ts
- [ ] automod.ts
- [ ] commandValidator.ts
- [ ] dataStore.ts
- [ ] discordErrors.ts
- [ ] exportAnalytics.ts
- [ ] featureFlags.ts
- [ ] guildLogging.ts
- [ ] integrationPoller.ts
- [ ] integrationWebhook.ts
- [ ] lruCache.ts
- [ ] metrics.ts
- [ ] modLog.ts
- [ ] nsfwDetection.ts
- [ ] pollScheduler.ts
- [ ] raidDetection.ts
- [ ] reminderScheduler.ts
- [ ] reportHandler.ts
- [ ] tempbanScheduler.ts
- [ ] tempRolesScheduler.ts
- [ ] transcriptGenerator.ts
- [ ] tracing.ts
- [ ] xp.ts

### CLI & Config
- [ ] bin/apollo.ts
- [ ] scripts/deploy-commands.ts
- [ ] config/config.ts

### Build & Deploy
- [ ] Update package.json: `"discord.js": "^15.0.0"` (or specific version)
- [ ] Update @discordjs/builders, @discordjs/rest versions
- [ ] Run `pnpm install`
- [ ] Run `pnpm build`
- [ ] Fix TypeScript compilation errors
- [ ] Run `pnpm lint`
- [ ] Run `pnpm test`
- [ ] Run `pnpm deploy:commands` (test command registration)

---

## Post-Migration Phase

### Verification
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing of core bot functionality
- [ ] Test all slash commands
- [ ] Test all context menu commands
- [ ] Test all button/modal interactions
- [ ] Test event handlers (guildCreate, messageCreate, etc.)
- [ ] Test queue processing
- [ ] Test interlink functionality
- [ ] Test plugin load/unload/reload
- [ ] Test gateway leader election
- [ ] Test worker mode

### Performance & Monitoring
- [ ] Benchmark memory usage vs v14
- [ ] Benchmark event processing latency
- [ ] Monitor for new deprecation warnings
- [ ] Update health check endpoints if needed

### Documentation
- [ ] Update README.md with v15 requirements
- [ ] Update any internal docs referencing v14 APIs
- [ ] Update CHANGELOG.md with migration notes
- [ ] Archive v14-specific migration docs

### Release
- [ ] Create release branch
- [ ] Version bump (major version)
- [ ] Generate release notes
- [ ] Deploy to staging
- [ ] Deploy to production
- [ ] Monitor error rates post-deployment
- [ ] Close tracking issue

---

## Rollback Plan

If critical issues found post-deployment:
1. Revert package.json to v14
2. `pnpm install`
3. `pnpm build`
4. Deploy v14 build
5. Document blockers for next attempt

---

## Risk Assessment (from audit)

| Area | Occurrences | Files | Risk Level |
|------|-------------|-------|------------|
| MessageFlags | 518 | 90 | HIGH |
| Interaction reply | 498 | 93 | HIGH |
| CommandInteraction | 301 | 102 | HIGH |
| ChatInputCommandInteraction | 269 | 96 | HIGH |
| EmbedBuilder | 198 | 63 | HIGH |
| PermissionFlagsBits | 111 | 42 | HIGH |
| User | 112 | 56 | MEDIUM |
| Guild | 84 | 24 | MEDIUM |
| TextChannel | 50 | 21 | MEDIUM |
| SlashCommandBuilder | 77 | 30 | MEDIUM |
| PermissionsBitField | 72 | 29 | MEDIUM |
| ButtonBuilder | 42 | 11 | MEDIUM |
| Attachment | 41 | 11 | MEDIUM |
| ChannelType | 37 | 10 | MEDIUM |
| Events | 62 | 18 | LOW |
| REST | 18 | 7 | LOW |
| Routes | 25 | 4 | LOW |

---

## Notes

- This checklist is based on the API audit from `docs/discordjs-v15-audit.md` (246 files scanned)
- Update this checklist as v15 breaking changes are confirmed
- Each checkbox should be verified by the person completing the task
- Consider pair programming for high-risk areas