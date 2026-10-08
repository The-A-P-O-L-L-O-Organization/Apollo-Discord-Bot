# discord.js v14 → v15 API Audit

Generated: 2026-09-27T22:50:47.531Z
Files scanned: 246

| API | Total Occurrences | Files Affected |
|-----|-------------------|----------------|
| GatewayIntentBits | 10 | 3 |
| EmbedBuilder | 198 | 63 |
| Client constructor | 1 | 1 |
| Client login | 1 | 1 |
| Interaction reply | 498 | 93 |
| Interaction deferReply | 25 | 19 |
| Interaction editReply | 108 | 35 |
| Interaction followUp | 3 | 3 |
| CommandInteraction | 301 | 102 |
| ButtonInteraction | 10 | 4 |
| ModalSubmitInteraction | 4 | 2 |
| ChatInputCommandInteraction | 269 | 96 |
| MessageContextMenuCommandInteraction | 13 | 5 |
| UserContextMenuCommandInteraction | 5 | 2 |
| PermissionsBitField | 72 | 29 |
| PermissionFlagsBits | 111 | 42 |
| ChannelType | 37 | 10 |
| ComponentType | 2 | 1 |
| ButtonStyle | 30 | 9 |
| ActionRowBuilder | 25 | 13 |
| ButtonBuilder | 42 | 11 |
| StringSelectMenuBuilder | 2 | 1 |
| ModalBuilder | 7 | 4 |
| REST | 18 | 7 |
| Routes | 25 | 4 |
| Events | 62 | 18 |
| Partials | 11 | 4 |
| Collection | 30 | 7 |
| Snowflake | 2 | 1 |
| ApplicationCommandType | 10 | 6 |
| SlashCommandBuilder | 77 | 30 |
| ContextMenuCommandBuilder | 4 | 2 |
| MessageFlags | 518 | 90 |
| ColorResolvable | 2 | 1 |
| APIInteractionGuildMember | 2 | 1 |
| Guild | 84 | 24 |
| GuildMember | 47 | 17 |
| TextChannel | 50 | 21 |
| VoiceChannel | 17 | 8 |
| ThreadChannel | 9 | 3 |
| NewsChannel | 4 | 2 |
| StageChannel | 8 | 2 |
| Role | 20 | 8 |
| User | 112 | 56 |
| Message | 102 | 26 |
| Interaction | 20 | 9 |
| Attachment | 41 | 11 |
| Status | 6 | 5 |
| GatewayDispatchEvents | 1 | 1 |

---

## Per-File Breakdown

### GatewayIntentBits (10 total)

- `src/index.ts`: 6
- `src/types/discord.ts`: 2
- `src/types/gateway.ts`: 2

### EmbedBuilder (198 total)

- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/reactionrole.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 9
- `src/plugins/automod/commands/scanMessage.ts`: 3
- `src/plugins/automod/events/messageCreate.ts`: 2
- `src/plugins/moderation/commands/blacklist.ts`: 7
- `src/plugins/moderation/commands/clear.ts`: 7
- `src/plugins/moderation/commands/clearstrikes.ts`: 2
- `src/plugins/moderation/commands/clearwarnings.ts`: 2
- `src/plugins/moderation/commands/raidmode.ts`: 4
- `src/plugins/moderation/commands/reportMessage.ts`: 2
- `src/plugins/moderation/commands/reports.ts`: 4
- `src/plugins/moderation/commands/strike.ts`: 3
- `src/plugins/moderation/commands/strikeconfig.ts`: 2
- `src/plugins/moderation/commands/strikes.ts`: 2
- `src/plugins/moderation/commands/warnconfig.ts`: 5
- `src/plugins/moderation/commands/warnings.ts`: 2
- `src/plugins/moderation/events/guildMemberAdd.ts`: 3
- `src/plugins/tickets/commands/assign.ts`: 3
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 3
- `src/plugins/tickets/commands/ticketinfo.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketratings.ts`: 4
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 3
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 4
- `src/plugins/tickets/commands/tickettransfer.ts`: 4
- `src/plugins/tickets/events/interactionCreate.ts`: 3
- `src/plugins/tickets/events/slaMonitor.ts`: 3
- `src/plugins/utility/commands/analytics.ts`: 6
- `src/plugins/utility/commands/apollo.ts`: 3
- `src/plugins/utility/commands/channelinfo.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 6
- `src/plugins/utility/commands/embed.ts`: 2
- `src/plugins/utility/commands/giveaway.ts`: 2
- `src/plugins/utility/commands/help.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 2
- `src/plugins/utility/commands/level.ts`: 2
- `src/plugins/utility/commands/operatorcontact.ts`: 3
- `src/plugins/utility/commands/ping.ts`: 2
- `src/plugins/utility/commands/poll.ts`: 2
- `src/plugins/utility/commands/reminders.ts`: 2
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/roll.ts`: 2
- `src/plugins/utility/commands/serverinfo.ts`: 2
- `src/plugins/utility/commands/sla.ts`: 2
- `src/plugins/utility/commands/stats.ts`: 2
- `src/plugins/utility/commands/userinfo.ts`: 2
- `src/plugins/utility/events/messageCreate.ts`: 2
- `src/plugins/utility/plugin.ts`: 2
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1
- `src/utils/accessControl.ts`: 9
- `src/utils/discordErrors.ts`: 4
- `src/utils/guildLogging.ts`: 16
- `src/utils/modLog.ts`: 3
- `src/utils/pollScheduler.ts`: 3
- `src/utils/raidDetection.ts`: 2
- `src/utils/reminderScheduler.ts`: 2

### Client constructor (1 total)

- `src/index.ts`: 1

### Client login (1 total)

- `src/index.ts`: 1

### Interaction reply (498 total)

- `src/index.ts`: 4
- `src/plugins/admin/commands/language.ts`: 3
- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/queue.ts`: 2
- `src/plugins/admin/commands/reactionrole.ts`: 17
- `src/plugins/admin/commands/setlogchannel.ts`: 9
- `src/plugins/admin/commands/system.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 25
- `src/plugins/automod/commands/scanMessage.ts`: 1
- `src/plugins/integrations/commands/integration.ts`: 6
- `src/plugins/moderation/commands/autorole.ts`: 10
- `src/plugins/moderation/commands/ban.ts`: 8
- `src/plugins/moderation/commands/blacklist.ts`: 19
- `src/plugins/moderation/commands/case.ts`: 13
- `src/plugins/moderation/commands/clear.ts`: 5
- `src/plugins/moderation/commands/clearstrikes.ts`: 4
- `src/plugins/moderation/commands/clearwarnings.ts`: 6
- `src/plugins/moderation/commands/forceban.ts`: 5
- `src/plugins/moderation/commands/kick.ts`: 7
- `src/plugins/moderation/commands/lockdown.ts`: 3
- `src/plugins/moderation/commands/masskick.ts`: 6
- `src/plugins/moderation/commands/massmute.ts`: 6
- `src/plugins/moderation/commands/mute.ts`: 10
- `src/plugins/moderation/commands/nickname.ts`: 5
- `src/plugins/moderation/commands/note.ts`: 6
- `src/plugins/moderation/commands/purge.ts`: 8
- `src/plugins/moderation/commands/raidmode.ts`: 1
- `src/plugins/moderation/commands/reportMessage.ts`: 3
- `src/plugins/moderation/commands/reports.ts`: 10
- `src/plugins/moderation/commands/rolepersistence.ts`: 4
- `src/plugins/moderation/commands/slowmode.ts`: 3
- `src/plugins/moderation/commands/softban.ts`: 7
- `src/plugins/moderation/commands/strike.ts`: 7
- `src/plugins/moderation/commands/strikeconfig.ts`: 6
- `src/plugins/moderation/commands/strikes.ts`: 3
- `src/plugins/moderation/commands/tempban.ts`: 7
- `src/plugins/moderation/commands/temprole.ts`: 9
- `src/plugins/moderation/commands/timeout.ts`: 8
- `src/plugins/moderation/commands/unban.ts`: 5
- `src/plugins/moderation/commands/unlock.ts`: 3
- `src/plugins/moderation/commands/unmute.ts`: 7
- `src/plugins/moderation/commands/voicedeafen.ts`: 9
- `src/plugins/moderation/commands/voicedisconnect.ts`: 8
- `src/plugins/moderation/commands/voicemove.ts`: 10
- `src/plugins/moderation/commands/voicemute.ts`: 9
- `src/plugins/moderation/commands/voiceundeafen.ts`: 9
- `src/plugins/moderation/commands/voiceunmute.ts`: 9
- `src/plugins/moderation/commands/warn.ts`: 7
- `src/plugins/moderation/commands/warnconfig.ts`: 9
- `src/plugins/moderation/commands/warnings.ts`: 4
- `src/plugins/tickets/commands/assign.ts`: 4
- `src/plugins/tickets/commands/closeticket.ts`: 3
- `src/plugins/tickets/commands/ticket.ts`: 4
- `src/plugins/tickets/commands/ticketadd.ts`: 5
- `src/plugins/tickets/commands/ticketinfo.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 1
- `src/plugins/tickets/commands/ticketpriority.ts`: 4
- `src/plugins/tickets/commands/ticketsearch.ts`: 1
- `src/plugins/tickets/commands/ticketsetup.ts`: 5
- `src/plugins/tickets/commands/tickettemplate.ts`: 8
- `src/plugins/tickets/commands/tickettransfer.ts`: 4
- `src/plugins/tickets/events/interactionCreate.ts`: 4
- `src/plugins/utility/commands/8ball.ts`: 1
- `src/plugins/utility/commands/announcement.ts`: 9
- `src/plugins/utility/commands/apollo.ts`: 2
- `src/plugins/utility/commands/apolloActions.ts`: 5
- `src/plugins/utility/commands/avatar.ts`: 1
- `src/plugins/utility/commands/banner.ts`: 3
- `src/plugins/utility/commands/cancelreminder.ts`: 3
- `src/plugins/utility/commands/channelinfo.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 1
- `src/plugins/utility/commands/embed.ts`: 11
- `src/plugins/utility/commands/giveaway.ts`: 5
- `src/plugins/utility/commands/help.ts`: 1
- `src/plugins/utility/commands/invite.ts`: 5
- `src/plugins/utility/commands/joke.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 2
- `src/plugins/utility/commands/level.ts`: 1
- `src/plugins/utility/commands/operatorcontact.ts`: 2
- `src/plugins/utility/commands/poll.ts`: 4
- `src/plugins/utility/commands/remind.ts`: 3
- `src/plugins/utility/commands/reminders.ts`: 2
- `src/plugins/utility/commands/report.ts`: 3
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/roll.ts`: 5
- `src/plugins/utility/commands/serverinfo.ts`: 1
- `src/plugins/utility/commands/stats.ts`: 1
- `src/plugins/utility/commands/tag.ts`: 17
- `src/plugins/utility/commands/translate.ts`: 2
- `src/plugins/utility/commands/userinfo.ts`: 2
- `src/utils/accessControl.ts`: 1
- `src/utils/discordErrors.ts`: 1
- `src/utils/reportHandler.ts`: 4

### Interaction deferReply (25 total)

- `src/index.ts`: 1
- `src/plugins/admin/commands/migrate.ts`: 1
- `src/plugins/admin/commands/plugin.ts`: 1
- `src/plugins/admin/commands/queue.ts`: 1
- `src/plugins/automod/commands/automod.ts`: 1
- `src/plugins/automod/commands/scanMessage.ts`: 1
- `src/plugins/interlink/commands/interlink.ts`: 1
- `src/plugins/moderation/commands/massmute.ts`: 1
- `src/plugins/moderation/commands/raidmode.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 1
- `src/plugins/tickets/commands/ticketratings.ts`: 1
- `src/plugins/tickets/commands/ticketsearch.ts`: 1
- `src/plugins/tickets/commands/ticketstats.ts`: 1
- `src/plugins/tickets/events/interactionCreate.ts`: 1
- `src/plugins/utility/commands/analytics.ts`: 6
- `src/plugins/utility/commands/ping.ts`: 1
- `src/plugins/utility/commands/poll.ts`: 1
- `src/plugins/utility/commands/sla.ts`: 1
- `src/plugins/utility/commands/translate.ts`: 1

### Interaction editReply (108 total)

- `src/index.ts`: 4
- `src/plugins/admin/commands/migrate.ts`: 2
- `src/plugins/admin/commands/plugin.ts`: 18
- `src/plugins/admin/commands/queue.ts`: 1
- `src/plugins/automod/commands/automod.ts`: 3
- `src/plugins/automod/commands/scanMessage.ts`: 3
- `src/plugins/interlink/commands/interlink.ts`: 22
- `src/plugins/moderation/commands/ban.ts`: 1
- `src/plugins/moderation/commands/blacklist.ts`: 1
- `src/plugins/moderation/commands/case.ts`: 1
- `src/plugins/moderation/commands/clear.ts`: 3
- `src/plugins/moderation/commands/kick.ts`: 1
- `src/plugins/moderation/commands/masskick.ts`: 2
- `src/plugins/moderation/commands/massmute.ts`: 1
- `src/plugins/moderation/commands/mute.ts`: 1
- `src/plugins/moderation/commands/purge.ts`: 1
- `src/plugins/moderation/commands/raidmode.ts`: 4
- `src/plugins/moderation/commands/strike.ts`: 1
- `src/plugins/moderation/commands/unban.ts`: 1
- `src/plugins/moderation/commands/unmute.ts`: 1
- `src/plugins/moderation/commands/warn.ts`: 1
- `src/plugins/tickets/commands/ticketlist.ts`: 3
- `src/plugins/tickets/commands/ticketratings.ts`: 8
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketstats.ts`: 1
- `src/plugins/tickets/events/interactionCreate.ts`: 3
- `src/plugins/utility/commands/analytics.ts`: 8
- `src/plugins/utility/commands/datadeletion.ts`: 1
- `src/plugins/utility/commands/ping.ts`: 1
- `src/plugins/utility/commands/poll.ts`: 1
- `src/plugins/utility/commands/sla.ts`: 1
- `src/plugins/utility/commands/translate.ts`: 1
- `src/queue/jobs/processCommand.ts`: 3
- `src/utils/accessControl.ts`: 1
- `src/utils/discordErrors.ts`: 1

### Interaction followUp (3 total)

- `src/plugins/utility/commands/giveaway.ts`: 1
- `src/plugins/utility/commands/translate.ts`: 1
- `src/utils/discordErrors.ts`: 1

### CommandInteraction (301 total)

- `src/index.ts`: 4
- `src/plugins/admin/commands/language.ts`: 2
- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/migrate.ts`: 2
- `src/plugins/admin/commands/plugin.ts`: 2
- `src/plugins/admin/commands/queue.ts`: 2
- `src/plugins/admin/commands/reactionrole.ts`: 2
- `src/plugins/admin/commands/setlogchannel.ts`: 2
- `src/plugins/admin/commands/system.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 12
- `src/plugins/automod/commands/scanMessage.ts`: 2
- `src/plugins/integrations/commands/integration.ts`: 2
- `src/plugins/interlink/commands/interlink.ts`: 9
- `src/plugins/moderation/commands/autorole.ts`: 6
- `src/plugins/moderation/commands/ban.ts`: 2
- `src/plugins/moderation/commands/blacklist.ts`: 7
- `src/plugins/moderation/commands/case.ts`: 7
- `src/plugins/moderation/commands/clear.ts`: 7
- `src/plugins/moderation/commands/clearstrikes.ts`: 2
- `src/plugins/moderation/commands/clearwarnings.ts`: 2
- `src/plugins/moderation/commands/forceban.ts`: 2
- `src/plugins/moderation/commands/kick.ts`: 2
- `src/plugins/moderation/commands/lockdown.ts`: 2
- `src/plugins/moderation/commands/masskick.ts`: 2
- `src/plugins/moderation/commands/massmute.ts`: 2
- `src/plugins/moderation/commands/mute.ts`: 2
- `src/plugins/moderation/commands/nickname.ts`: 2
- `src/plugins/moderation/commands/note.ts`: 5
- `src/plugins/moderation/commands/purge.ts`: 2
- `src/plugins/moderation/commands/raidmode.ts`: 2
- `src/plugins/moderation/commands/reportMessage.ts`: 2
- `src/plugins/moderation/commands/reports.ts`: 2
- `src/plugins/moderation/commands/rolepersistence.ts`: 5
- `src/plugins/moderation/commands/slowmode.ts`: 2
- `src/plugins/moderation/commands/softban.ts`: 2
- `src/plugins/moderation/commands/strike.ts`: 2
- `src/plugins/moderation/commands/strikeconfig.ts`: 2
- `src/plugins/moderation/commands/strikes.ts`: 2
- `src/plugins/moderation/commands/tempban.ts`: 2
- `src/plugins/moderation/commands/temprole.ts`: 5
- `src/plugins/moderation/commands/timeout.ts`: 2
- `src/plugins/moderation/commands/unban.ts`: 2
- `src/plugins/moderation/commands/unlock.ts`: 2
- `src/plugins/moderation/commands/unmute.ts`: 2
- `src/plugins/moderation/commands/voicedeafen.ts`: 2
- `src/plugins/moderation/commands/voicedisconnect.ts`: 2
- `src/plugins/moderation/commands/voicemove.ts`: 2
- `src/plugins/moderation/commands/voicemute.ts`: 2
- `src/plugins/moderation/commands/voiceundeafen.ts`: 2
- `src/plugins/moderation/commands/voiceunmute.ts`: 2
- `src/plugins/moderation/commands/warn.ts`: 2
- `src/plugins/moderation/commands/warnconfig.ts`: 6
- `src/plugins/moderation/commands/warnings.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketinfo.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketratings.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/utility/commands/8ball.ts`: 2
- `src/plugins/utility/commands/analytics.ts`: 8
- `src/plugins/utility/commands/announcement.ts`: 5
- `src/plugins/utility/commands/apollo.ts`: 4
- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/avatar.ts`: 2
- `src/plugins/utility/commands/banner.ts`: 2
- `src/plugins/utility/commands/cancelreminder.ts`: 2
- `src/plugins/utility/commands/channelinfo.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 2
- `src/plugins/utility/commands/giveaway.ts`: 5
- `src/plugins/utility/commands/help.ts`: 2
- `src/plugins/utility/commands/invite.ts`: 2
- `src/plugins/utility/commands/joke.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 2
- `src/plugins/utility/commands/level.ts`: 2
- `src/plugins/utility/commands/operatorcontact.ts`: 2
- `src/plugins/utility/commands/ping.ts`: 2
- `src/plugins/utility/commands/poll.ts`: 2
- `src/plugins/utility/commands/remind.ts`: 2
- `src/plugins/utility/commands/reminders.ts`: 2
- `src/plugins/utility/commands/report.ts`: 2
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/roll.ts`: 2
- `src/plugins/utility/commands/serverinfo.ts`: 2
- `src/plugins/utility/commands/sla.ts`: 2
- `src/plugins/utility/commands/stats.ts`: 2
- `src/plugins/utility/commands/tag.ts`: 8
- `src/plugins/utility/commands/translate.ts`: 2
- `src/plugins/utility/commands/userinfo.ts`: 2
- `src/types/discord.ts`: 11
- `src/types/index.ts`: 2
- `src/types/shared.ts`: 6
- `src/utils/accessControl.ts`: 4
- `src/utils/discordErrors.ts`: 13

### ButtonInteraction (10 total)

- `src/plugins/tickets/events/interactionCreate.ts`: 4
- `src/types/discord.ts`: 3
- `src/types/index.ts`: 1
- `src/types/shared.ts`: 2

### ModalSubmitInteraction (4 total)

- `src/types/discord.ts`: 3
- `src/types/index.ts`: 1

### ChatInputCommandInteraction (269 total)

- `src/index.ts`: 4
- `src/plugins/admin/commands/language.ts`: 2
- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/migrate.ts`: 2
- `src/plugins/admin/commands/plugin.ts`: 2
- `src/plugins/admin/commands/queue.ts`: 2
- `src/plugins/admin/commands/reactionrole.ts`: 2
- `src/plugins/admin/commands/setlogchannel.ts`: 2
- `src/plugins/admin/commands/system.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 12
- `src/plugins/integrations/commands/integration.ts`: 2
- `src/plugins/interlink/commands/interlink.ts`: 9
- `src/plugins/moderation/commands/autorole.ts`: 6
- `src/plugins/moderation/commands/ban.ts`: 2
- `src/plugins/moderation/commands/blacklist.ts`: 7
- `src/plugins/moderation/commands/case.ts`: 7
- `src/plugins/moderation/commands/clear.ts`: 7
- `src/plugins/moderation/commands/clearstrikes.ts`: 2
- `src/plugins/moderation/commands/clearwarnings.ts`: 2
- `src/plugins/moderation/commands/forceban.ts`: 2
- `src/plugins/moderation/commands/kick.ts`: 2
- `src/plugins/moderation/commands/lockdown.ts`: 2
- `src/plugins/moderation/commands/masskick.ts`: 2
- `src/plugins/moderation/commands/massmute.ts`: 2
- `src/plugins/moderation/commands/mute.ts`: 2
- `src/plugins/moderation/commands/nickname.ts`: 2
- `src/plugins/moderation/commands/note.ts`: 5
- `src/plugins/moderation/commands/purge.ts`: 2
- `src/plugins/moderation/commands/raidmode.ts`: 2
- `src/plugins/moderation/commands/reports.ts`: 2
- `src/plugins/moderation/commands/rolepersistence.ts`: 5
- `src/plugins/moderation/commands/slowmode.ts`: 2
- `src/plugins/moderation/commands/softban.ts`: 2
- `src/plugins/moderation/commands/strike.ts`: 2
- `src/plugins/moderation/commands/strikeconfig.ts`: 2
- `src/plugins/moderation/commands/strikes.ts`: 2
- `src/plugins/moderation/commands/tempban.ts`: 2
- `src/plugins/moderation/commands/temprole.ts`: 5
- `src/plugins/moderation/commands/timeout.ts`: 2
- `src/plugins/moderation/commands/unban.ts`: 2
- `src/plugins/moderation/commands/unlock.ts`: 2
- `src/plugins/moderation/commands/unmute.ts`: 2
- `src/plugins/moderation/commands/voicedeafen.ts`: 2
- `src/plugins/moderation/commands/voicedisconnect.ts`: 2
- `src/plugins/moderation/commands/voicemove.ts`: 2
- `src/plugins/moderation/commands/voicemute.ts`: 2
- `src/plugins/moderation/commands/voiceundeafen.ts`: 2
- `src/plugins/moderation/commands/voiceunmute.ts`: 2
- `src/plugins/moderation/commands/warn.ts`: 2
- `src/plugins/moderation/commands/warnconfig.ts`: 6
- `src/plugins/moderation/commands/warnings.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketinfo.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketratings.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/utility/commands/8ball.ts`: 2
- `src/plugins/utility/commands/analytics.ts`: 8
- `src/plugins/utility/commands/announcement.ts`: 5
- `src/plugins/utility/commands/apollo.ts`: 4
- `src/plugins/utility/commands/avatar.ts`: 2
- `src/plugins/utility/commands/banner.ts`: 2
- `src/plugins/utility/commands/cancelreminder.ts`: 2
- `src/plugins/utility/commands/channelinfo.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 2
- `src/plugins/utility/commands/giveaway.ts`: 5
- `src/plugins/utility/commands/help.ts`: 2
- `src/plugins/utility/commands/invite.ts`: 2
- `src/plugins/utility/commands/joke.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 2
- `src/plugins/utility/commands/level.ts`: 2
- `src/plugins/utility/commands/operatorcontact.ts`: 2
- `src/plugins/utility/commands/ping.ts`: 2
- `src/plugins/utility/commands/poll.ts`: 2
- `src/plugins/utility/commands/remind.ts`: 2
- `src/plugins/utility/commands/reminders.ts`: 2
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/roll.ts`: 2
- `src/plugins/utility/commands/serverinfo.ts`: 2
- `src/plugins/utility/commands/sla.ts`: 2
- `src/plugins/utility/commands/stats.ts`: 2
- `src/plugins/utility/commands/tag.ts`: 8
- `src/plugins/utility/commands/userinfo.ts`: 2
- `src/types/discord.ts`: 3
- `src/types/shared.ts`: 2
- `src/utils/accessControl.ts`: 4
- `src/utils/discordErrors.ts`: 5

### MessageContextMenuCommandInteraction (13 total)

- `src/plugins/automod/commands/scanMessage.ts`: 2
- `src/plugins/moderation/commands/reportMessage.ts`: 2
- `src/plugins/utility/commands/report.ts`: 2
- `src/plugins/utility/commands/translate.ts`: 2
- `src/utils/discordErrors.ts`: 5

### UserContextMenuCommandInteraction (5 total)

- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/utils/discordErrors.ts`: 3

### PermissionsBitField (72 total)

- `src/plugins/automod/commands/automod.ts`: 3
- `src/plugins/automod/commands/scanMessage.ts`: 3
- `src/plugins/moderation/commands/ban.ts`: 2
- `src/plugins/moderation/commands/case.ts`: 2
- `src/plugins/moderation/commands/clear.ts`: 2
- `src/plugins/moderation/commands/forceban.ts`: 2
- `src/plugins/moderation/commands/kick.ts`: 2
- `src/plugins/moderation/commands/lockdown.ts`: 6
- `src/plugins/moderation/commands/masskick.ts`: 2
- `src/plugins/moderation/commands/massmute.ts`: 2
- `src/plugins/moderation/commands/mute.ts`: 2
- `src/plugins/moderation/commands/purge.ts`: 3
- `src/plugins/moderation/commands/raidmode.ts`: 2
- `src/plugins/moderation/commands/slowmode.ts`: 2
- `src/plugins/moderation/commands/softban.ts`: 2
- `src/plugins/moderation/commands/tempban.ts`: 2
- `src/plugins/moderation/commands/temprole.ts`: 2
- `src/plugins/moderation/commands/timeout.ts`: 2
- `src/plugins/moderation/commands/unban.ts`: 2
- `src/plugins/moderation/commands/unlock.ts`: 2
- `src/plugins/moderation/commands/unmute.ts`: 2
- `src/plugins/moderation/commands/warn.ts`: 2
- `src/plugins/utility/commands/announcement.ts`: 2
- `src/plugins/utility/commands/giveaway.ts`: 2
- `src/plugins/utility/commands/help.ts`: 7
- `src/plugins/utility/commands/invite.ts`: 2
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/tag.ts`: 3
- `src/utils/accessControl.ts`: 3

### PermissionFlagsBits (111 total)

- `src/plugins/admin/commands/language.ts`: 2
- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/setlogchannel.ts`: 2
- `src/plugins/integrations/commands/integration.ts`: 2
- `src/plugins/moderation/commands/autorole.ts`: 2
- `src/plugins/moderation/commands/blacklist.ts`: 2
- `src/plugins/moderation/commands/clearstrikes.ts`: 2
- `src/plugins/moderation/commands/clearwarnings.ts`: 2
- `src/plugins/moderation/commands/nickname.ts`: 2
- `src/plugins/moderation/commands/note.ts`: 2
- `src/plugins/moderation/commands/reports.ts`: 2
- `src/plugins/moderation/commands/rolepersistence.ts`: 2
- `src/plugins/moderation/commands/strike.ts`: 2
- `src/plugins/moderation/commands/strikeconfig.ts`: 2
- `src/plugins/moderation/commands/strikes.ts`: 2
- `src/plugins/moderation/commands/voicedeafen.ts`: 2
- `src/plugins/moderation/commands/voicedisconnect.ts`: 2
- `src/plugins/moderation/commands/voicemove.ts`: 2
- `src/plugins/moderation/commands/voicemute.ts`: 2
- `src/plugins/moderation/commands/voiceundeafen.ts`: 2
- `src/plugins/moderation/commands/voiceunmute.ts`: 2
- `src/plugins/moderation/commands/warnconfig.ts`: 2
- `src/plugins/moderation/commands/warnings.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 16
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketratings.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/tickets/events/interactionCreate.ts`: 16
- `src/plugins/utility/commands/analytics.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 2
- `src/plugins/utility/commands/poll.ts`: 2
- `src/plugins/utility/commands/sla.ts`: 2
- `src/types/discord.ts`: 2
- `src/utils/commandValidator.ts`: 1

### ChannelType (37 total)

- `src/plugins/admin/commands/setlogchannel.ts`: 3
- `src/plugins/automod/commands/automod.ts`: 7
- `src/plugins/moderation/commands/voicemove.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 5
- `src/plugins/tickets/events/interactionCreate.ts`: 2
- `src/plugins/tickets/events/slaMonitor.ts`: 3
- `src/plugins/utility/commands/serverinfo.ts`: 6
- `src/types/discord.ts`: 2
- `src/utils/raidDetection.ts`: 5

### ComponentType (2 total)

- `src/plugins/moderation/commands/masskick.ts`: 2

### ButtonStyle (30 total)

- `src/plugins/moderation/commands/clear.ts`: 3
- `src/plugins/moderation/commands/masskick.ts`: 3
- `src/plugins/moderation/commands/reportMessage.ts`: 4
- `src/plugins/tickets/commands/ticket.ts`: 3
- `src/plugins/tickets/commands/ticketlist.ts`: 5
- `src/plugins/tickets/commands/ticketsearch.ts`: 5
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/events/interactionCreate.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 3

### ActionRowBuilder (25 total)

- `src/plugins/moderation/commands/clear.ts`: 2
- `src/plugins/moderation/commands/masskick.ts`: 2
- `src/plugins/moderation/commands/reportMessage.ts`: 2
- `src/plugins/tickets/commands/ticket.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/events/interactionCreate.ts`: 2
- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 2
- `src/plugins/utility/commands/translate.ts`: 2
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1

### ButtonBuilder (42 total)

- `src/plugins/moderation/commands/clear.ts`: 4
- `src/plugins/moderation/commands/masskick.ts`: 4
- `src/plugins/moderation/commands/reportMessage.ts`: 5
- `src/plugins/tickets/commands/ticket.ts`: 4
- `src/plugins/tickets/commands/ticketlist.ts`: 6
- `src/plugins/tickets/commands/ticketsearch.ts`: 6
- `src/plugins/tickets/commands/ticketsetup.ts`: 3
- `src/plugins/tickets/events/interactionCreate.ts`: 3
- `src/plugins/utility/commands/datadeletion.ts`: 4
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1

### StringSelectMenuBuilder (2 total)

- `src/types/discord.ts`: 2

### ModalBuilder (7 total)

- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/translate.ts`: 2
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1

### REST (18 total)

- `src/core/PluginManager.ts`: 2
- `src/queue/jobs/processCommand.ts`: 4
- `src/queue/remoteInteraction.ts`: 6
- `src/types/discord.ts`: 2
- `src/types/gateway.ts`: 2
- `src/types/index.ts`: 1
- `src/utils/discordErrors.ts`: 1

### Routes (25 total)

- `src/core/PluginManager.ts`: 4
- `src/queue/remoteInteraction.ts`: 18
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1

### Events (62 total)

- `src/config/config.ts`: 2
- `src/core/Plugin.ts`: 2
- `src/plugins/admin/commands/logging.ts`: 12
- `src/plugins/admin/events/guildCreate.ts`: 1
- `src/plugins/admin/plugin.ts`: 2
- `src/plugins/automod/plugin.ts`: 2
- `src/plugins/interlink/plugin.ts`: 2
- `src/plugins/moderation/plugin.ts`: 2
- `src/plugins/tickets/plugin.ts`: 2
- `src/plugins/utility/plugin.ts`: 2
- `src/types/capabilities.ts`: 5
- `src/types/config.ts`: 2
- `src/types/discord.ts`: 4
- `src/types/eventbus.ts`: 1
- `src/types/gateway.ts`: 10
- `src/types/index.ts`: 5
- `src/types/shared.ts`: 2
- `src/utils/commandValidator.ts`: 4

### Partials (11 total)

- `src/core/Plugin.ts`: 1
- `src/core/PluginManager.ts`: 1
- `src/index.ts`: 7
- `src/types/discord.ts`: 2

### Collection (30 total)

- `src/index.ts`: 2
- `src/plugins/moderation/commands/purge.ts`: 2
- `src/queue/jobs/processCommand.ts`: 2
- `src/queue/remoteInteraction.ts`: 18
- `src/types/discord.ts`: 2
- `src/types/shared.ts`: 2
- `src/utils/nsfwDetection.ts`: 2

### Snowflake (2 total)

- `src/types/discord.ts`: 2

### ApplicationCommandType (10 total)

- `src/plugins/automod/commands/scanMessage.ts`: 2
- `src/plugins/moderation/commands/purge.ts`: 2
- `src/plugins/moderation/commands/reportMessage.ts`: 1
- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/report.ts`: 2
- `src/types/discord.ts`: 1

### SlashCommandBuilder (77 total)

- `src/plugins/admin/commands/language.ts`: 2
- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/admin/commands/setlogchannel.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketinfo.ts`: 2
- `src/plugins/tickets/commands/ticketlist.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketratings.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/utility/commands/analytics.ts`: 2
- `src/plugins/utility/commands/apollo.ts`: 2
- `src/plugins/utility/commands/cancelreminder.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 2
- `src/plugins/utility/commands/operatorcontact.ts`: 2
- `src/plugins/utility/commands/reminders.ts`: 2
- `src/plugins/utility/commands/serverinfo.ts`: 2
- `src/plugins/utility/commands/sla.ts`: 2
- `src/plugins/utility/commands/stats.ts`: 2
- `src/types/discord.ts`: 21
- `src/types/index.ts`: 1
- `src/types/shared.ts`: 2
- `src/utils/commandValidator.ts`: 1

### ContextMenuCommandBuilder (4 total)

- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/report.ts`: 2

### MessageFlags (518 total)

- `src/index.ts`: 5
- `src/plugins/admin/commands/language.ts`: 4
- `src/plugins/admin/commands/logging.ts`: 3
- `src/plugins/admin/commands/migrate.ts`: 2
- `src/plugins/admin/commands/plugin.ts`: 2
- `src/plugins/admin/commands/queue.ts`: 3
- `src/plugins/admin/commands/reactionrole.ts`: 18
- `src/plugins/admin/commands/setlogchannel.ts`: 10
- `src/plugins/admin/commands/system.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 19
- `src/plugins/automod/commands/scanMessage.ts`: 3
- `src/plugins/integrations/commands/integration.ts`: 7
- `src/plugins/interlink/commands/interlink.ts`: 2
- `src/plugins/moderation/commands/autorole.ts`: 8
- `src/plugins/moderation/commands/ban.ts`: 8
- `src/plugins/moderation/commands/blacklist.ts`: 16
- `src/plugins/moderation/commands/case.ts`: 14
- `src/plugins/moderation/commands/clear.ts`: 4
- `src/plugins/moderation/commands/clearstrikes.ts`: 4
- `src/plugins/moderation/commands/clearwarnings.ts`: 6
- `src/plugins/moderation/commands/forceban.ts`: 5
- `src/plugins/moderation/commands/kick.ts`: 7
- `src/plugins/moderation/commands/lockdown.ts`: 3
- `src/plugins/moderation/commands/masskick.ts`: 7
- `src/plugins/moderation/commands/massmute.ts`: 8
- `src/plugins/moderation/commands/mute.ts`: 10
- `src/plugins/moderation/commands/nickname.ts`: 5
- `src/plugins/moderation/commands/note.ts`: 7
- `src/plugins/moderation/commands/purge.ts`: 8
- `src/plugins/moderation/commands/reportMessage.ts`: 4
- `src/plugins/moderation/commands/reports.ts`: 11
- `src/plugins/moderation/commands/rolepersistence.ts`: 3
- `src/plugins/moderation/commands/slowmode.ts`: 3
- `src/plugins/moderation/commands/softban.ts`: 7
- `src/plugins/moderation/commands/strike.ts`: 7
- `src/plugins/moderation/commands/strikeconfig.ts`: 3
- `src/plugins/moderation/commands/strikes.ts`: 2
- `src/plugins/moderation/commands/tempban.ts`: 7
- `src/plugins/moderation/commands/temprole.ts`: 8
- `src/plugins/moderation/commands/timeout.ts`: 8
- `src/plugins/moderation/commands/unban.ts`: 5
- `src/plugins/moderation/commands/unlock.ts`: 3
- `src/plugins/moderation/commands/unmute.ts`: 7
- `src/plugins/moderation/commands/voicedeafen.ts`: 9
- `src/plugins/moderation/commands/voicedisconnect.ts`: 8
- `src/plugins/moderation/commands/voicemove.ts`: 10
- `src/plugins/moderation/commands/voicemute.ts`: 9
- `src/plugins/moderation/commands/voiceundeafen.ts`: 9
- `src/plugins/moderation/commands/voiceunmute.ts`: 9
- `src/plugins/moderation/commands/warn.ts`: 7
- `src/plugins/moderation/commands/warnconfig.ts`: 6
- `src/plugins/moderation/commands/warnings.ts`: 3
- `src/plugins/tickets/commands/assign.ts`: 4
- `src/plugins/tickets/commands/closeticket.ts`: 3
- `src/plugins/tickets/commands/ticket.ts`: 5
- `src/plugins/tickets/commands/ticketadd.ts`: 5
- `src/plugins/tickets/commands/ticketinfo.ts`: 3
- `src/plugins/tickets/commands/ticketlist.ts`: 3
- `src/plugins/tickets/commands/ticketpriority.ts`: 4
- `src/plugins/tickets/commands/ticketratings.ts`: 2
- `src/plugins/tickets/commands/ticketsearch.ts`: 3
- `src/plugins/tickets/commands/ticketsetup.ts`: 6
- `src/plugins/tickets/commands/ticketstats.ts`: 2
- `src/plugins/tickets/commands/tickettemplate.ts`: 9
- `src/plugins/tickets/commands/tickettransfer.ts`: 4
- `src/plugins/tickets/events/interactionCreate.ts`: 5
- `src/plugins/utility/commands/analytics.ts`: 2
- `src/plugins/utility/commands/announcement.ts`: 10
- `src/plugins/utility/commands/apolloActions.ts`: 6
- `src/plugins/utility/commands/cancelreminder.ts`: 4
- `src/plugins/utility/commands/channelinfo.ts`: 2
- `src/plugins/utility/commands/datadeletion.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 12
- `src/plugins/utility/commands/giveaway.ts`: 6
- `src/plugins/utility/commands/invite.ts`: 4
- `src/plugins/utility/commands/joke.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 2
- `src/plugins/utility/commands/operatorcontact.ts`: 3
- `src/plugins/utility/commands/poll.ts`: 5
- `src/plugins/utility/commands/remind.ts`: 4
- `src/plugins/utility/commands/reminders.ts`: 3
- `src/plugins/utility/commands/report.ts`: 4
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/plugins/utility/commands/roll.ts`: 5
- `src/plugins/utility/commands/sla.ts`: 2
- `src/plugins/utility/commands/tag.ts`: 17
- `src/plugins/utility/commands/translate.ts`: 5
- `src/plugins/utility/commands/userinfo.ts`: 2
- `src/utils/discordErrors.ts`: 3
- `src/utils/reportHandler.ts`: 5

### ColorResolvable (2 total)

- `src/utils/guildLogging.ts`: 2

### APIInteractionGuildMember (2 total)

- `src/utils/moderation.ts`: 2

### Guild (84 total)

- `src/core/PluginManager.ts`: 1
- `src/plugins/admin/events/guildDelete.ts`: 1
- `src/plugins/moderation/plugin.ts`: 4
- `src/plugins/tickets/events/slaMonitor.ts`: 7
- `src/plugins/utility/plugin.ts`: 2
- `src/queue/nsfwClient.ts`: 1
- `src/types/database.ts`: 1
- `src/types/discord.ts`: 2
- `src/types/eventbus.ts`: 1
- `src/types/gateway.ts`: 4
- `src/types/index.ts`: 1
- `src/utils/analyticsCollector.ts`: 10
- `src/utils/automod.ts`: 2
- `src/utils/dataStore.ts`: 10
- `src/utils/exportAnalytics.ts`: 2
- `src/utils/featureFlags.ts`: 1
- `src/utils/guildLogging.ts`: 4
- `src/utils/lruCache.ts`: 6
- `src/utils/modLog.ts`: 3
- `src/utils/nsfwDetection.ts`: 2
- `src/utils/raidDetection.ts`: 13
- `src/utils/tempbanScheduler.ts`: 1
- `src/utils/transcriptGenerator.ts`: 2
- `src/utils/xp.ts`: 3

### GuildMember (47 total)

- `src/plugins/moderation/events/guildMemberAdd.ts`: 2
- `src/plugins/moderation/events/guildMemberRemove.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/tickets/events/interactionCreate.ts`: 2
- `src/queue/remoteInteraction.ts`: 3
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 2
- `src/utils/accessControl.ts`: 8
- `src/utils/automod.ts`: 3
- `src/utils/guildLogging.ts`: 5
- `src/utils/modLog.ts`: 2
- `src/utils/moderation.ts`: 2
- `src/utils/raidDetection.ts`: 4

### TextChannel (50 total)

- `src/plugins/automod/commands/scanMessage.ts`: 2
- `src/plugins/automod/events/messageCreate.ts`: 2
- `src/plugins/moderation/commands/lockdown.ts`: 2
- `src/plugins/moderation/commands/purge.ts`: 2
- `src/plugins/moderation/commands/slowmode.ts`: 2
- `src/plugins/moderation/commands/unlock.ts`: 2
- `src/plugins/moderation/events/guildMemberAdd.ts`: 2
- `src/plugins/tickets/commands/assign.ts`: 2
- `src/plugins/tickets/commands/ticketadd.ts`: 2
- `src/plugins/tickets/commands/ticketpriority.ts`: 2
- `src/plugins/tickets/commands/ticketsetup.ts`: 2
- `src/plugins/tickets/commands/tickettransfer.ts`: 2
- `src/plugins/tickets/events/slaMonitor.ts`: 2
- `src/plugins/utility/commands/channelinfo.ts`: 7
- `src/utils/integrationPoller.ts`: 4
- `src/utils/integrationWebhook.ts`: 2
- `src/utils/modLog.ts`: 2
- `src/utils/raidDetection.ts`: 2
- `src/utils/reminderScheduler.ts`: 2
- `src/utils/reportHandler.ts`: 3
- `src/utils/tempbanScheduler.ts`: 2

### VoiceChannel (17 total)

- `src/plugins/moderation/commands/voicedeafen.ts`: 1
- `src/plugins/moderation/commands/voicedisconnect.ts`: 1
- `src/plugins/moderation/commands/voicemove.ts`: 3
- `src/plugins/moderation/commands/voicemute.ts`: 1
- `src/plugins/moderation/commands/voiceundeafen.ts`: 1
- `src/plugins/moderation/commands/voiceunmute.ts`: 1
- `src/plugins/utility/commands/channelinfo.ts`: 7
- `src/types/discord.ts`: 2

### ThreadChannel (9 total)

- `src/plugins/moderation/commands/purge.ts`: 2
- `src/plugins/utility/commands/channelinfo.ts`: 5
- `src/types/discord.ts`: 2

### NewsChannel (4 total)

- `src/plugins/moderation/commands/purge.ts`: 2
- `src/types/discord.ts`: 2

### StageChannel (8 total)

- `src/plugins/utility/commands/channelinfo.ts`: 6
- `src/types/discord.ts`: 2

### Role (20 total)

- `src/plugins/admin/commands/logging.ts`: 2
- `src/plugins/automod/cli/index.ts`: 3
- `src/plugins/moderation/commands/rolepersistence.ts`: 2
- `src/plugins/moderation/commands/temprole.ts`: 5
- `src/plugins/utility/commands/roleinfo.ts`: 2
- `src/types/discord.ts`: 2
- `src/utils/guildLogging.ts`: 3
- `src/utils/tempRolesScheduler.ts`: 1

### User (112 total)

- `src/index.ts`: 2
- `src/plugins/admin/events/guildBanAdd.ts`: 2
- `src/plugins/admin/events/guildBanRemove.ts`: 2
- `src/plugins/automod/commands/automod.ts`: 2
- `src/plugins/moderation/cli/index.ts`: 4
- `src/plugins/moderation/commands/ban.ts`: 1
- `src/plugins/moderation/commands/blacklist.ts`: 4
- `src/plugins/moderation/commands/forceban.ts`: 3
- `src/plugins/moderation/commands/kick.ts`: 1
- `src/plugins/moderation/commands/mute.ts`: 1
- `src/plugins/moderation/commands/nickname.ts`: 1
- `src/plugins/moderation/commands/note.ts`: 4
- `src/plugins/moderation/commands/rolepersistence.ts`: 1
- `src/plugins/moderation/commands/softban.ts`: 1
- `src/plugins/moderation/commands/strike.ts`: 1
- `src/plugins/moderation/commands/tempban.ts`: 1
- `src/plugins/moderation/commands/temprole.ts`: 2
- `src/plugins/moderation/commands/timeout.ts`: 1
- `src/plugins/moderation/commands/unban.ts`: 3
- `src/plugins/moderation/commands/unmute.ts`: 1
- `src/plugins/moderation/commands/voicedeafen.ts`: 1
- `src/plugins/moderation/commands/voicedisconnect.ts`: 1
- `src/plugins/moderation/commands/voicemove.ts`: 1
- `src/plugins/moderation/commands/voicemute.ts`: 1
- `src/plugins/moderation/commands/voiceundeafen.ts`: 1
- `src/plugins/moderation/commands/voiceunmute.ts`: 1
- `src/plugins/moderation/commands/warn.ts`: 1
- `src/plugins/moderation/commands/warnings.ts`: 1
- `src/plugins/moderation/plugin.ts`: 2
- `src/plugins/tickets/cli/index.ts`: 3
- `src/plugins/tickets/commands/ticketsearch.ts`: 1
- `src/plugins/tickets/plugin.ts`: 2
- `src/plugins/utility/cli/index.ts`: 1
- `src/plugins/utility/commands/analytics.ts`: 2
- `src/plugins/utility/commands/apolloActions.ts`: 2
- `src/plugins/utility/commands/leaderboard.ts`: 3
- `src/plugins/utility/commands/level.ts`: 1
- `src/plugins/utility/plugin.ts`: 1
- `src/queue/nsfwClient.ts`: 1
- `src/types/discord.ts`: 2
- `src/types/gateway.ts`: 4
- `src/types/index.ts`: 1
- `src/utils/analyticsCollector.ts`: 2
- `src/utils/automod.ts`: 5
- `src/utils/dataStore.ts`: 5
- `src/utils/discordErrors.ts`: 2
- `src/utils/exportAnalytics.ts`: 2
- `src/utils/featureFlags.ts`: 1
- `src/utils/guildLogging.ts`: 8
- `src/utils/lruCache.ts`: 4
- `src/utils/metrics.ts`: 1
- `src/utils/modLog.ts`: 1
- `src/utils/raidDetection.ts`: 1
- `src/utils/reportHandler.ts`: 2
- `src/utils/tempbanScheduler.ts`: 4
- `src/utils/xp.ts`: 2

### Message (102 total)

- `src/config/config.ts`: 1
- `src/generated/interlink/interlink/v1/interlink_pb.ts`: 14
- `src/generated/interlink/nsfw/v1/nsfw_pb.ts`: 5
- `src/generated/nsfw/interlink/v1/interlink_pb.ts`: 14
- `src/generated/nsfw/nsfw/v1/nsfw_pb.ts`: 5
- `src/index.ts`: 1
- `src/plugins/admin/commands/logging.ts`: 4
- `src/plugins/admin/events/messageDeleteBulk.ts`: 1
- `src/plugins/admin/events/messageUpdate.ts`: 1
- `src/plugins/automod/commands/scanMessage.ts`: 1
- `src/plugins/automod/events/messageCreate.ts`: 3
- `src/plugins/interlink/commands/interlink.ts`: 2
- `src/plugins/moderation/commands/clear.ts`: 1
- `src/plugins/moderation/commands/reportMessage.ts`: 4
- `src/plugins/tickets/commands/closeticket.ts`: 2
- `src/plugins/tickets/events/interactionCreate.ts`: 2
- `src/plugins/utility/commands/report.ts`: 1
- `src/plugins/utility/commands/translate.ts`: 1
- `src/plugins/utility/events/messageCreate.ts`: 2
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1
- `src/utils/analyticsCollector.ts`: 1
- `src/utils/automod.ts`: 15
- `src/utils/guildLogging.ts`: 10
- `src/utils/reportHandler.ts`: 7
- `src/utils/transcriptGenerator.ts`: 1

### Interaction (20 total)

- `src/index.ts`: 2
- `src/queue/remoteInteraction.ts`: 1
- `src/queue/serializeInteraction.ts`: 1
- `src/types/discord.ts`: 2
- `src/types/index.ts`: 1
- `src/types/shared.ts`: 4
- `src/utils/accessControl.ts`: 7
- `src/utils/discordErrors.ts`: 1
- `src/utils/tracing.ts`: 1

### Attachment (41 total)

- `src/plugins/automod/commands/automod.ts`: 2
- `src/plugins/automod/commands/scanMessage.ts`: 2
- `src/plugins/automod/events/messageCreate.ts`: 2
- `src/plugins/utility/commands/analytics.ts`: 2
- `src/plugins/utility/commands/embed.ts`: 8
- `src/types/discord.ts`: 14
- `src/types/eventbus.ts`: 1
- `src/types/rpc-schemas.ts`: 1
- `src/utils/guildLogging.ts`: 1
- `src/utils/nsfwDetection.ts`: 6
- `src/utils/transcriptGenerator.ts`: 2

### Status (6 total)

- `src/config/config.ts`: 1
- `src/plugins/moderation/commands/raidmode.ts`: 1
- `src/plugins/moderation/commands/reports.ts`: 1
- `src/plugins/utility/commands/serverinfo.ts`: 1
- `src/utils/healthServer.ts`: 2

### GatewayDispatchEvents (1 total)

- `src/types/discord.ts`: 1


