Responsibility
Handles Discord guild member add and remove events to enforce moderation policies, manage role persistence, log member activity, send welcome/farewell messages, and perform raid detection with Redis-backed fallback.

Design
Uses Discord.js event listener pattern: each file exports an object with `name`, `once`, and `async execute(member, client)`. Relies on utility modules for logging (`logger.js`), database operations (`db.js`), moderation logging (`modLog.js`), raid detection (`raidDetection.js` with Redis fallback via `lock.js`), analytics (`analyticsCollector.js`), and configuration (`config.js`). Employs `EmbedBuilder` for rich message formatting and async/await for sequential asynchronous operations. Implements Redis-backed raid detection when `config.automod.useRedisRaidDetection` is true, using `getLockRedis`, `trackJoinRedis`, and `checkRaidPatternRedis`; otherwise falls back to in-memory `checkRaidPattern`.

Flow
Member Add:
1. Receive `guildMemberAdd` event with `member` and `client`.
2. Track member join via `trackMemberChange(guild.id, true, guild.memberCount)`.
3. If member is not a bot, perform raid detection:
   a. If Redis raid detection enabled, acquire Redis lock via `getLockRedis`, track join with `trackJoinRedis`, and check pattern with `checkRaidPatternRedis`.
   b. Otherwise, use in-memory `checkRaidPattern(guild.id, member)`.
   c. If raid detected, call `handleRaidDetected(guild, member)`.
4. Perform blacklist check: fetch global and guild blacklists; if member is blacklisted, attempt to DM user, ban with reason, log moderation action, then return.
5. If not blacklisted and not a bot, assign auto-role from guild autorole configuration.
6. If role persistence enabled, restore saved roles for member and delete saved entry.
7. If member is not a bot, create and log member join embed via `createMemberJoinEmbed` and `logEvent`.
8. Determine welcome channel (configured welcome channel, system channel, or none) and send welcome message with embed if permissions allow.

Member Remove:
1. Receive `guildMemberRemove` event with `member` and `client`.
2. Ignore if member is a bot.
3. Track member leave via `trackMemberChange(guild.id, false, guild.memberCount)`.
4. If role persistence enabled, save member's roles (excluding @everyone) with timestamp and username.
5. Create and log member leave embed via `createMemberLeaveEmbed` and `logEvent`.

Integration
Dependencies:
- `../../../utils/logger.js` (logEvent, createMemberJoinEmbed, createMemberLeaveEmbed)
- `../../../utils/db.js` (getGuildData, getData, updateGuildData)
- `../../../utils/modLog.js` (sendModLog) – only in guildMemberAdd
- `../../../utils/raidDetection.js` (checkRaidPattern, handleRaidDetected) – only in guildMemberAdd
- `../../../utils/lock.js` (getLockRedis) – only in guildMemberAdd when Redis raid detection enabled
- `../../../utils/analyticsCollector.js` (trackMemberChange)
- `../../../config/config.js` (welcome channel name and message, automod.useRedisRaidDetection) – only in guildMemberAdd
Consumed by: Discord client event system (external loader) that registers these handlers for `guildMemberAdd` and `guildMemberRemove` events.