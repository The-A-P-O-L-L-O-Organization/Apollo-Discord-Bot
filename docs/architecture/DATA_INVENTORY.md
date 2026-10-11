# Personal Data Inventory — Apollo Discord Bot

## Database: guild_store (per-guild configuration & moderation)

| Store | Fields | Personal Data | Category | Retention | Encryption |
|-------|--------|---------------|----------|-----------|------------|
| config | modLogChannel, muteRole, banDmTemplate, caseNumber, slowmodeDefault | Guild IDs, channel IDs, role IDs | Identifiers | Indefinite | No |
| config | automodEnabled, bannedWords[], linkFilter, inviteFilter, spamThreshold, spamWindow, exemptRoles[], exemptChannels[] | Guild config | Config | Indefinite | No |
| config | ticketCategory, ticketLogChannel, ticketSupportRoles[], ticketAutoClose, ticketTranscriptChannel | Channel/role IDs | Identifiers | Indefinite | No |
| config | youtubeChannel, twitchChannel, twitterUser, rssFeeds[] | External service IDs | Identifiers | Indefinite | No |
| config | prefix, language, timezone, welcomeChannel, welcomeMessage, leaveMessage, autoroles[] | Guild preferences | Preferences | Indefinite | No |
| config | interlinkEnabled, interlinkApiKey, interlinkTrustedBots[] | **API keys, bot IDs** | Auth credentials | Until rotated | **Yes (field-level)** |
| config | custom{} | Operator-defined | Varies | Indefinite | No |
| moderation | caseNumber, modLogChannel, muteRole | See config | — | — | — |
| moderation | warnings[], strikes[], notes[], cases[] | **User IDs, moderator IDs, reasons, timestamps** | Moderation history | Indefinite | No |
| moderation | blacklist[] | **User IDs** | Blocklist | Indefinite | No |
| automod | bannedWords[], exemptRoles[], exemptChannels[] | See config | — | — | — |
| automod | violation logs (if stored) | **User IDs, message content, timestamps** | Behavioral | Indefinite | No |
| tickets | ticketCategory, ticketLogChannel, ticketSupportRoles[], ticketAutoClose, ticketTranscriptChannel | See config | — | — | — |
| tickets | openTickets[], closedTickets[] | **User IDs (creator, participants), channel IDs, transcripts** | Communication | Indefinite | No |
| integrations | youtubeChannel, twitchChannel, twitterUser, rssFeeds[] | See config | — | — | — |
| utility | prefix, language, timezone, welcomeChannel, autoroles[] | See config | — | — | — |
| utility | levels (XP), reminders[], polls[], giveaways[], tags[] | **User IDs, creator IDs, votes, entries** | Activity/Engagement | Indefinite | No |
| interlink | interlinkEnabled, interlinkApiKey, interlinkTrustedBots[] | See config | — | — | — |
| reports | reports[] | **Reporter ID, reported user ID, message content, channel ID** | Moderation | Indefinite | No |
| temproles | temproles[] | **User IDs, role IDs, expiry timestamps** | Role assignments | Until expiry | No |
| tempbans | tempbans[] | **User IDs, expiry timestamps** | Moderation | Until expiry | No |
| rolepersistence | savedRoles[] | **User IDs, role IDs** | Role assignments | Indefinite | No |
| lockdown | lockedChannels[] | Channel IDs | Config | Until cleared | No |
| raidmode | raidModeEnabled, raidModeConfig | Guild config | Config | Indefinite | No |
| slowmode | slowmodeChannels[] | Channel IDs, durations | Config | Indefinite | No |
| nickname | savedNicknames[] | **User IDs, nicknames** | Identity | Indefinite | No |
| voicestate | voiceLogs[] | **User IDs, channel IDs, timestamps** | Voice activity | Indefinite | No |
| analytics | commandCounts{}, messageCounts{} | **User IDs, guild IDs, counts** | Analytics | 90 days | No |
| embeds | embeds[] | Operator content | Config | Indefinite | No |
| tags | tags[] | **Owner IDs, content** | User content | Indefinite | No |
| announcements | announcements[] | Operator content | Config | Indefinite | No |
| apolloinfo | infoEntries[] | Operator content | Config | Indefinite | No |
| invites | inviteTracker[] | **User IDs, invite codes, uses** | Invite tracking | Indefinite | No |
| datadeletion | deletionRequests[] | **User IDs, timestamps, summaries** | DSAR records | Indefinite | No |
| operatorcontact | contactInfo | **Operator email/contact** | Contact | Indefinite | No |
| slareadout | slaRecords[] | **User IDs, ticket IDs, timestamps** | SLA tracking | Indefinite | No |

## Database: guild_user_store (per-user per-guild data)

| Store | Fields | Personal Data | Category | Retention | Encryption |
|-------|--------|---------------|----------|-----------|------------|
| user | language, timezone, dmNotifications | **User preferences** | Preferences | Indefinite | No |
| user | warnings[], mutes, kicks, bans | **User IDs, moderator IDs, reasons, timestamps** | Moderation history | Indefinite | No |
| user | openTickets[], ticketCount | **User IDs, ticket IDs** | Communication | Indefinite | No |
| user | balance, dailyStreak, lastDaily | **User IDs, economic data** | Economy | Indefinite | No |
| user | custom{} | Operator-defined | Varies | Indefinite | No |
| levels | xp, level, totalXp, lastMessage | **User IDs, activity metrics** | Profiling | Indefinite | No |
| reminders | reminders[] | **User IDs, messages, channels, times** | User content | Until fired | No |
| polls | polls[] | **Creator IDs, votes per user** | Engagement | Indefinite | No |
| giveaways | giveaways[] | **Creator IDs, entrant IDs, winners** | Engagement | Indefinite | No |
| tags | tags[] | **Owner IDs, content** | User content | Indefinite | No |

## Database: interlink_bots

| Table | Fields | Personal Data | Category | Retention | Encryption |
|-------|--------|---------------|----------|-----------|------------|
| interlink_bots | id, name, description, webhook_url, supports_redis, api_key_hash, api_key_prefix, scopes, is_active, last_seen_at, created_at, updated_at | **Bot IDs, webhook URLs, API key hashes** | Auth credentials | Until revoked | **Yes (api_key_hash)** |

## Redis (Transient / Volatile)

| Key Pattern | Content | Personal Data | TTL | Purpose |
|-------------|---------|---------------|-----|---------|
| apollo:spam:* | Message timestamps, user IDs, channel IDs, counts | **User IDs, guild IDs, message metadata** | Configurable (spamWindow) | Spam detection |
| apollo:raid:* | Join timestamps, user IDs | **User IDs, guild IDs, timestamps** | Configurable | Raid detection |
| apollo:threat:* | Threat scores per user per guild | **User IDs, guild IDs, scores** | Configurable | Threat profiling |
| apollo:queue:* | Serialized interactions (user ID, guild ID, command, options) | **User IDs, guild IDs, command data** | Job TTL (1h default) | Queue processing |
| apollo:lock:* | Lock holder, timestamp | Guild IDs, user IDs | Lock TTL | Coordination |
| apollo:ratelimit:* | User IDs, counts, windows | **User IDs, guild IDs** | Window TTL | Rate limiting |
| apollo:interlink:* | Event payloads, bot IDs | **User IDs, guild IDs, event data** | Delivery TTL | Cross-bot events |

## Metrics (Prometheus)

| Metric | Labels | Personal Data | Retention |
|--------|--------|---------------|-----------|
| apollo_spam_detections_total | guild, type, action | **Guild ID** | Prometheus retention |
| apollo_spam_confidence | guild, type | **Guild ID** | Prometheus retention |
| apollo_threat_score | guild | **Guild ID** | Prometheus retention |
| apollo_spam_actions_total | guild, action | **Guild ID** | Prometheus retention |
| apollo_spam_tracker_entries | guild | **Guild ID** | Prometheus retention |

## Logs (Pino Structured Logs)

| Logger Context | Fields | Personal Data | Retention |
|----------------|--------|---------------|-----------|
| plugin:* | guildId, userId, channelId | **User IDs, guild IDs, channel IDs** | Log retention policy |
| securityLog | userId, guildId, targetId, requestId | **User IDs, guild IDs** | 90 days (configurable) |
| queue jobs | serialized interaction | **User IDs, guild IDs, command data** | Job lifecycle |

## Backups

| Backup Type | Contains | Personal Data | Retention |
|-------------|----------|---------------|-----------|
| SQLite file / pg_dump | All database tables above | All above | Operator-defined |
| Redis RDB/AOF | All Redis keys above | All above | Operator-defined |
| Config/Secrets (.env) | ENCRYPTION_KEY, tokens, API keys | **Secrets, not personal data** | Operator-defined |

## Data Flow Summary

```
Discord Gateway (Controller: Discord NL BV)
    │
    ▼
Apollo Bot Instance (Processor for API Data; Controller for configured data)
    │
    ├─▶ SQLite/PostgreSQL (Processor) — persistent storage
    ├─▶ Redis (Processor) — transient state, queues, spam/threat
    ├─▶ Prometheus (Controller) — metrics with guild labels
    ├─▶ Loki/Log Aggregator (Processor) — structured logs
    ├─▶ NSFW Rust Service (Processor) — image analysis only
    ├─▶ Interlink Go Relay (Joint Controller / Processor) — cross-bot events
    └─▶ External APIs (Processors) — OpenAI, Argos, Twitch, YouTube, GitHub
```

## DSAR Coverage Checklist

| Data Category | /data-deletion | /data-request (PLANNED) | /export-my-data (PLANNED) |
|---------------|----------------|-------------------------|---------------------------|
| Moderation history (warnings, strikes, notes, cases) | ✅ | ❌ | ❌ |
| Moderation actions (bans, kicks, mutes, timeouts) | ❌ | ❌ | ❌ |
| Blacklist entries | ❌ | ❌ | ❌ |
| Ticket data (creator, participant, transcripts) | ✅ | ❌ | ❌ |
| Utility data (levels, reminders, polls, giveaways, tags) | ✅ | ❌ | ❌ |
| User preferences (language, timezone, notifications) | ❌ | ❌ | ❌ |
| Automod violations / threat scores | ❌ | ❌ | ❌ |
| Interlink data (bot registration, events) | ❌ | ❌ | ❌ |
| Reports (reporter, reported) | ❌ | ❌ | ❌ |
| Temp roles / temp bans / role persistence | ❌ | ❌ | ❌ |
| Nickname history | ❌ | ❌ | ❌ |
| Voice state logs | ❌ | ❌ | ❌ |
| Analytics / metrics | ❌ | ❌ | ❌ |
| Invite tracker | ❌ | ❌ | ❌ |
| Security log entries | ❌ | ❌ | ❌ |
| Data deletion request logs | ❌ | ❌ | ❌ |
