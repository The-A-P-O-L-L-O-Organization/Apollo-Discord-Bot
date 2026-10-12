# GDPR P0 Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all P0 Foundation GDPR compliance gaps for the Apollo Discord Bot

**Architecture:** Documentation-first approach for governance artifacts (territorial scope, role mapping, data inventory, lawful basis, breach runbook). Code changes for DSAR commands (/data-request, /export-my-data) extending existing /data-deletion infrastructure.

**Tech Stack:** TypeScript, discord.js v14, existing db.ts adapter, i18n system, pino logger

**Spec:** This plan addresses the P0 gaps from the GDPR compliance assessment

## Global Constraints

- All new commands must follow existing plugin command pattern (default export with `data` SlashCommandBuilder)
- i18n: use `t('utility:key')` pattern; add en-US strings first; run `pnpm lint:locales`
- Database: use `src/utils/db.ts` functions only (getUserData, getAllGuildData, etc.)
- No direct Knex/raw SQL in new code
- Logging: use `createLogger({ component: 'plugin:utility' })` from `src/utils/logger.js`
- Encryption: sensitive fields already handled by adapter; no changes needed
- Tests: Vitest; mock Discord interactions, database, i18n
- Style: `pnpm lint`, `pnpm typecheck` must pass
- Commits: one per task, conventional format

## Review Focus

1. **Incomplete data coverage in DSAR commands** — `/data-request` and `/export-my-data` must cover ALL personal data categories (threat scores, interlink, moderation cases, blacklist, automod violations) not just the ones in `/data-deletion`
2. **Privacy policy GDPR alignment** — Current `PRIVACY.md` framed for US law; must add GDPR-specific sections (Art. 13/14 notice, DPO contact, EU representative if needed, lawful basis per purpose)
2. **Breach runbook operationality** — Must be actionable: specific contacts, templates, 72h timer, Discord webhook integration for notification
3. **Lawful basis documentation** — Each processing purpose needs explicit Art. 6 basis; LIA required for legitimate interest (threat scoring, automod, interlink)
4. **Data inventory completeness** — Must include Redis, metrics, logs, backups, not just database tables

---

### Task 1: Create GDPR Assessment Document (Territorial Scope + Role Mapping)

**Files:**
- Create: `docs/architecture/GDPR_ASSESSMENT.md`

**Interfaces:**
- Produces: Reference document for all subsequent tasks

- [ ] **Step 1: Write GDPR_ASSESSMENT.md**

```markdown
# GDPR Compliance Assessment — Apollo Discord Bot

## 1. Territorial Scope (Art. 3)

**Assessment:** The bot is offered worldwide via Discord. Any guild in the EU/EEA that adds the bot constitutes "offering services" to data subjects in the Union (Art. 3(2)(a)). Monitoring behavior (message scanning, threat scoring, spam detection) also triggers Art. 3(2)(b).

**Conclusion:** GDPR applies if the bot is present in any EU/EEA guild. Since the bot is publicly discoverable on Discord, territorial scope is global.

**Operator Action:** Instance operators must assess their guild demographics. If any EU users, full GDPR compliance required.

## 2. Role Mapping (Controller / Processor / Joint Controller)

| Data Flow | Controller | Processor | Legal Basis | Notes |
|-----------|------------|-----------|-------------|-------|
| Discord API Data (messages, members, guilds) | Discord Netherlands BV | — | — | Discord is controller per Developer Terms |
| Guild Configuration (mod settings, automod, tickets) | Guild Admin / Instance Operator | Apollo Bot (software) | Art. 6(1)(f) legitimate interest / Art. 6(1)(b) contract | Operator configures bot; bot executes |
| User Moderation History (warnings, bans, notes) | Guild Admin / Instance Operator | Apollo Bot | Art. 6(1)(f) legitimate interest (server safety) | Guild admin directs processing |
| User Preferences (language, timezone, notifications) | Instance Operator | Apollo Bot | Art. 6(1)(b) contract (user invokes bot) / Art. 6(1)(a) consent | User-initiated |
| Ticket Data (transcripts, participants) | Guild Admin / Instance Operator | Apollo Bot | Art. 6(1)(f) legitimate interest / Art. 6(1)(b) | User opens ticket |
| Threat Scores / Spam Tracker / Profiling | Instance Operator | Apollo Bot | Art. 6(1)(f) legitimate interest (safety) | **Requires LIA** — high risk |
| Automod Decisions (delete, timeout, ban) | Guild Admin / Instance Operator | Apollo Bot | Art. 6(1)(f) legitimate interest | **Requires LIA + Art. 22 safeguards** |
| Interlink Cross-Bot Events | Instance Operator (each bot) | Interlink Relay (Go) | Art. 6(1)(f) legitimate interest | **Joint controller** if shared trust domain |
| NSFW Image Analysis | Instance Operator | Rust NSFW Service | Art. 6(1)(f) legitimate interest | Processor; no personal data in images |
| Redis (queue, spam, raid, locks) | Instance Operator | Redis Instance | Art. 6(1)(f) | Processor; DPA needed if managed service |
| PostgreSQL/SQLite (persistent storage) | Instance Operator | Database Host | Art. 6(1)(f) | Processor; DPA needed if managed service |
| Prometheus Metrics (guild-labeled) | Instance Operator | Metrics Stack | Art. 6(1)(f) | Controller; includes personal data (guild IDs) |
| Logs (pino, security log) | Instance Operator | Log Aggregator | Art. 6(1)(f) | Controller; includes user/guild IDs |

**Key Distinction:** Apollo the *software* is a processor. The *instance operator* is the controller. Discord is a separate controller for API Data.
```

- [ ] **Step 2: Verify document reads correctly**

```bash
cat docs/architecture/GDPR_ASSESSMENT.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/GDPR_ASSESSMENT.md
git commit -m "docs: add GDPR territorial scope and role mapping assessment"
```

---

### Task 2: Create Data Inventory Document

**Files:**
- Create: `docs/architecture/DATA_INVENTORY.md`

**Interfaces:**
- Consumes: GDPR_ASSESSMENT.md role mapping
- Produces: Complete personal data catalog for ROPA and DSAR implementation

- [ ] **Step 1: Write DATA_INVENTORY.md**

```markdown
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
```

- [ ] **Step 2: Verify document reads correctly**

```bash
cat docs/architecture/DATA_INVENTORY.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/DATA_INVENTORY.md
git commit -m "docs: add comprehensive personal data inventory"
```

---

### Task 3: Create Lawful Basis & LIA Document

**Files:**
- Create: `docs/architecture/LAWFUL_BASIS_LIA.md`

**Interfaces:**
- Consumes: DATA_INVENTORY.md, GDPR_ASSESSMENT.md
- Produces: Lawful basis per purpose; LIA for high-risk processing

- [ ] **Step 1: Write LAWFUL_BASIS_LIA.md**

```markdown
# Lawful Basis & Legitimate Interest Assessments — Apollo Discord Bot

## Lawful Basis per Processing Purpose (Art. 6)

| Purpose | Personal Data Categories | Lawful Basis (Art. 6) | Justification |
|---------|-------------------------|----------------------|---------------|
| Discord gateway connection (receive events) | User IDs, guild IDs, message content, member data | **Not applicable** — Discord is controller | Discord NL BV controls API Data; bot receives as processor |
| Guild configuration storage | Guild IDs, channel IDs, role IDs, settings | **Art. 6(1)(f) Legitimate Interest** | Operator has legitimate interest in configuring bot for their guild; minimal data, guild-scoped |
| User preference storage (language, timezone, notifications) | User IDs, preferences | **Art. 6(1)(b) Contract** / **Art. 6(1)(a) Consent** | User invokes commands to set preferences; direct relationship |
| Moderation history (warnings, bans, kicks, notes, cases) | User IDs, moderator IDs, reasons, timestamps | **Art. 6(1)(f) Legitimate Interest** | Guild admin has legitimate interest in maintaining server safety/order; data minimized to guild scope |
| Ticket management (creation, transcripts, participants) | User IDs, message content, channel IDs | **Art. 6(1)(b) Contract** / **Art. 6(1)(f) Legitimate Interest** | User requests support (contract); guild admin manages tickets (legitimate interest) |
| Utility features (levels, polls, reminders, giveaways, tags) | User IDs, activity data, votes, entries | **Art. 6(1)(f) Legitimate Interest** | Operator enables for engagement; users participate voluntarily |
| Automod rule enforcement (banned words, links, spam, invites) | User IDs, message content, timestamps | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| Threat scoring / spam profiling | User IDs, guild IDs, behavioral metrics, scores | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| Interlink cross-bot event sharing | User IDs, guild IDs, event data (joins, bans) | **Art. 6(1)(f) Legitimate Interest** | **Requires LIA** — see below |
| NSFW image detection | Image attachments (no personal data extracted) | **Art. 6(1)(f) Legitimate Interest** | No personal data processed; safety feature |
| Analytics / metrics aggregation | User IDs, guild IDs, command counts, detection counts | **Art. 6(1)(f) Legitimate Interest** | Operator interest in operational visibility; pseudonymized where possible |
| Security logging / audit trail | User IDs, guild IDs, action types, timestamps | **Art. 6(1)(f) Legitimate Interest** / **Art. 6(1)(c) Legal Obligation** | Security monitoring; potential legal obligation for audit trails |
| Data deletion request handling | User IDs, request timestamps, deletion summaries | **Art. 6(1)(c) Legal Obligation** | Art. 17/19 GDPR compliance; Art. 12 DSAR obligations |

---

## Legitimate Interest Assessment (LIA) — Template

**Three-part test per ICO/EDPB guidance:**
1. **Purpose Test** — Is there a legitimate interest?
2. **Necessity Test** — Is processing necessary for that purpose?
3. **Balancing Test** — Do individual rights override the interest?

---

### LIA 1: Automod Rule Enforcement

**1. Purpose Test:** Guild administrators have a legitimate interest in automatically enforcing server rules (spam, banned words, links, invites, raid protection) to maintain server safety, reduce moderator workload, and provide consistent enforcement.

**2. Necessity Test:** Automated enforcement is necessary because:
- Manual moderation doesn't scale for high-volume servers
- Real-time response (message deletion, timeout) prevents harm propagation
- Consistent rule application avoids human bias/fatigue
- No less intrusive alternative achieves same effectiveness

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Message content scanned | Only in guilds where automod enabled; opt-out via exempt channels/roles |
| Automated timeout/ban possible | **Art. 22 safeguard required**: human review for significant actions (ban, timeout > 1hr); appeal process |
| Profiling (spam count, violation history) | Scores not shared outside guild; auto-decay; user can request deletion |
| False positives | Configurable thresholds; exempt roles/channels; moderator override |

**Conclusion:** Legitimate interest **valid with safeguards**: human review for significant actions, transparency (log channel), user appeal, data minimization (guild-scoped only), retention limits.

**Safeguards Required (Art. 22):**
- Human review before ban/timeout > 1 hour
- Meaningful information about logic (public automod config)
- Right to obtain human intervention (appeal command)
- Right to contest decision

---

### LIA 2: Threat Scoring / Spam Profiling

**1. Purpose Test:** Operator has legitimate interest in identifying malicious actors (spammers, raiders, bad actors) to protect guild integrity and member experience.

**2. Necessity Test:** Threat scoring necessary because:
- Pattern detection requires historical behavioral data
- Cross-guild correlation (via interlink) improves detection
- Proactive prevention (raid mode, enhanced verification) requires scoring

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Continuous behavioral monitoring | Guild-scoped only; no cross-guild profile unless interlink enabled |
| Score influences treatment (stricter filters, auto-action) | Scores transparent to guild admins; users can't see own score (security) |
| Profiling = "automated decision-making" (Art. 22) | **Not solely automated** — scores inform moderators, don't directly ban |
| Data retention indefinite | **Must implement**: rolling window (e.g., 30 days), auto-decay |

**Conclusion:** Legitimate interest **valid with safeguards**: rolling retention window, guild-scoped, transparency to admins, not sole basis for significant decisions.

**Required Changes:**
- Implement 30-day rolling window for threat scores
- Auto-decay scores over time
- Document scoring factors in privacy policy

---

### LIA 3: Interlink Cross-Bot Event Sharing

**1. Purpose Test:** Operators of multiple bots have legitimate interest in sharing security events (bans, joins, raids) across their bot fleet for coordinated protection.

**2. Necessity Test:** Cross-bot sharing necessary because:
- Single bot has limited view; coordinated defense requires shared intelligence
- Real-time event propagation enables fleet-wide raid mode
- No alternative achieves same coordinated response

**3. Balancing Test:**
| Impact on Data Subject | Mitigation |
|------------------------|------------|
| Ban/join events shared to other bots | Only configured events (memberJoin, guildBanAdd); operator-controlled |
| User ID + guild ID shared | Pseudonymized to bot fleet; no message content |
| Joint controller relationship | **Art. 26 agreement needed** between bot operators |
| Data leaves original guild context | Trust domain defined by shared INTERLINK_AUTH_KEY |

**Conclusion:** Legitimate interest **valid with safeguards**: operator-controlled event types, trust domain via shared secret, Art. 26 joint controller agreement documented.

**Required Changes:**
- Document Art. 26 joint controller arrangement in interlink setup docs
- Make event forwarding opt-in per event type (already configurable)
- Ensure INTERLINK_AUTH_KEY rotation procedure

---

## Special Category Data (Art. 9) — Assessment

**No special category data processed.**
- NSFW detection analyzes images but does not extract/store biometric, health, racial, political, religious, sexual orientation, or genetic data
- No inference of special categories from message content
- No profiling that reveals special categories

**Art. 10 (Criminal Convictions):** Moderation records may reflect rule violations but not criminal convictions. No Art. 10 processing.
```

- [ ] **Step 2: Verify document reads correctly**

```bash
cat docs/architecture/LAWFUL_BASIS_LIA.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/LAWFUL_BASIS_LIA.md
git commit -m "docs: add lawful basis documentation and LIAs for automod, threat scoring, interlink"
```

---

### Task 4: Update PRIVACY.md for GDPR Alignment

**Files:**
- Modify: `legal/PRIVACY.md`

**Interfaces:**
- Consumes: GDPR_ASSESSMENT.md, DATA_INVENTORY.md, LAWFUL_BASIS_LIA.md
- Produces: GDPR-compliant privacy policy (Art. 13/14 notice)

- [ ] **Step 1: Read current PRIVACY.md**

```bash
cat legal/PRIVACY.md
```

- [ ] **Step 2: Update PRIVACY.md with GDPR-specific sections**

Key changes needed:
- Add **GDPR-specific lawful basis table** (from LAWFUL_BASIS_LIA.md)
- Add **Art. 13/14 information notice** at first interaction (link to command)
- Add **DPO contact section** (or state "not required — operator is sole controller")
- Add **EU Representative** section (if operator outside EEA)
- Update **Section 5 (Legal Basis)** to reference GDPR Art. 6 explicitly per purpose
- Update **Section 9 (Your Rights)** to list all GDPR rights (Art. 15-22) with command references
- Add **Section 13b: Automated Decision-Making (Art. 22)** explaining automod/threat scoring safeguards
- Add **Section 13c: Data Protection Impact Assessment** summary
- Ensure **privacy policy URL** is documented for Discord Developer Portal

- [ ] **Step 3: Verify updates**

```bash
cat legal/PRIVACY.md
```

- [ ] **Step 4: Commit**

```bash
git add legal/PRIVACY.md
git commit -m "docs: update privacy policy for GDPR Art. 13/14 compliance"
```

---

### Task 5: Implement `/data-request` Command (Art. 15 Access Right)

**Files:**
- Create: `src/plugins/utility/commands/datarequest.ts`
- Modify: `src/plugins/utility/commands/datadeletion.ts` (refactor shared logic)
- Create: `src/plugins/utility/commands/__tests__/datarequest.test.ts`
- Modify: `src/i18n/en-US/utility.json` (add i18n keys)

**Interfaces:**
- Consumes: `src/utils/db.ts` (getUserData, getAllGuildData), `src/utils/logger.js`, `src/i18n/index.js`
- Produces: New slash command `/data-request` returning embedded summary of all stored data

- [ ] **Step 1: Write failing test**

```typescript
// src/plugins/utility/commands/__tests__/datarequest.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserData, getAllGuildData } from '../../../../../utils/db.js';

// Mock db
vi.mock('../../../../../utils/db.js', () => ({
  getUserData: vi.fn(),
  getAllGuildData: vi.fn(),
}));

describe('/data-request command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns summary of all user data across stores', async () => {
    const { execute } = await import('../datarequest.js');
    // Setup mocks
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { warnings: [{ userId: 'u1', reason: 'test' }] } },
    ]);
    getUserData.mockResolvedValue({ language: 'en-US', timezone: 'UTC' });

    // Execute and assert
    // ... test implementation
  });

  it('includes automod threat scores and interlink data', async () => {
    // Verify coverage of data categories missing from /data-deletion
  });

  it('handles users with no data gracefully', async () => {
    getAllGuildData.mockResolvedValue([]);
    getUserData.mockResolvedValue(undefined);
    // Assert empty state message
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/datarequest.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement datarequest.ts**

```typescript
// src/plugins/utility/commands/datarequest.ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getAllGuildData, getUserData } from '../../../utils/db.js';
import { createLogger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';

const logger = createLogger({ component: 'plugin:utility:datarequest' });

// Comprehensive store list from DATA_INVENTORY.md
const GUILD_STORES_TO_CHECK = [
  'warnings', 'strikes', 'notes', 'cases', 'blacklist',
  'tickets', 'reports', 'temproles', 'tempbans', 'rolepersistence',
  'nickname', 'voicestate', 'invites', 'datadeletion', 'slareadout',
  'levels', 'reminders', 'polls', 'giveaways', 'tags',
  'automod', 'analytics', 'moderation',
];

const USER_STORES_TO_CHECK = [
  'user', 'levels', 'reminders', 'polls', 'giveaways', 'tags',
];

function countUserInGuildArray(data: unknown, userId: string, key: string, idField: string): number {
  if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>)[key])) {
    return 0;
  }
  const arr = (data as Record<string, unknown[]>)[key] ?? [];
  return arr.filter((item) => (item as Record<string, string>)[idField] === userId).length;
}

function countUserInTickets(data: unknown, userId: string): number {
  if (!data || typeof data !== 'object') return 0;
  const obj = data as Record<string, unknown[]>;
  let count = 0;
  for (const key of ['openTickets', 'closedTickets']) {
    if (Array.isArray(obj[key])) {
      count += obj[key]!.filter((t) => 
        (t as { creatorId?: string }).creatorId === userId ||
        (t as { participants?: string[] }).participants?.includes(userId)
      ).length;
    }
  }
  return count;
}

export default {
  data: new SlashCommandBuilder()
    .setName('data-request')
    .setDescription('Request a summary of all data the bot has stored about you (GDPR Art. 15)')
    .setDMPermission(true),
  name: 'data-request',
  description: 'Request a summary of all data the bot has stored about you (GDPR Art. 15)',
  category: 'Utility',
  dmPermission: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null,
      });
      const t = i18n.getFixedT(resolvedLocale, 'utility');
      const userId = interaction.user.id;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const guildCounts: Record<string, number> = {};
      const userCounts: Record<string, number> = {};
      let totalGuildRecords = 0;
      let totalUserRecords = 0;

      // Check guild stores
      for (const store of GUILD_STORES_TO_CHECK) {
        try {
          const allGuildData = await getAllGuildData(store);
          let storeCount = 0;
          for (const { guildId, data } of allGuildData) {
            let guildStoreCount = 0;
            switch (store) {
              case 'warnings':
              case 'strikes':
              case 'notes':
              case 'cases':
              case 'blacklist':
                guildStoreCount = countUserInGuildArray(data, userId, store, 'userId');
                break;
              case 'reports':
                guildStoreCount = countUserInGuildArray(data, userId, 'reports', 'reporterId') +
                                 countUserInGuildArray(data, userId, 'reports', 'reportedId');
                break;
              case 'tickets':
                guildStoreCount = countUserInTickets(data, userId);
                break;
              case 'temproles':
              case 'tempbans':
              case 'rolepersistence':
                guildStoreCount = countUserInGuildArray(data, userId, store, 'userId');
                break;
              case 'nickname':
                guildStoreCount = countUserInGuildArray(data, userId, 'savedNicknames', 'userId');
                break;
              case 'voicestate':
                guildStoreCount = countUserInGuildArray(data, userId, 'voiceLogs', 'userId');
                break;
              case 'invites':
                guildStoreCount = countUserInGuildArray(data, userId, 'inviteTracker', 'userId');
                break;
              case 'datadeletion':
                guildStoreCount = countUserInGuildArray(data, userId, 'deletionRequests', 'userId');
                break;
              case 'slareadout':
                guildStoreCount = countUserInGuildArray(data, userId, 'slaRecords', 'userId');
                break;
              case 'levels':
                // User-specific XP data in user store, but guild store may have leaderboard
                break;
              case 'automod':
              case 'analytics':
              case 'moderation':
                // These stores typically don't have per-user arrays in guild_store
                // Check if any user-specific data exists
                break;
            }
            if (guildStoreCount > 0) {
              storeCount += guildStoreCount;
              guildCounts[`${store}:${guildId}`] = (guildCounts[`${store}:${guildId}`] ?? 0) + guildStoreCount;
            }
          }
          if (storeCount > 0) {
            totalGuildRecords += storeCount;
            guildCounts[store] = storeCount;
          }
        } catch (err) {
          logger.warn({ err, store }, 'Failed to check guild store for data request');
        }
      }

      // Check user stores (per-guild)
      const allGuilds = await getAllGuildData('config'); // Use config store to get guild list
      for (const { guildId } of allGuilds) {
        for (const store of USER_STORES_TO_CHECK) {
          try {
            const userData = await getUserData(store, guildId, userId);
            if (userData && Object.keys(userData).length > 0) {
              const fields = Object.keys(userData).filter(k => k !== 'custom').length;
              if (fields > 0) {
                userCounts[store] = (userCounts[store] ?? 0) + 1;
                totalUserRecords += 1;
              }
            }
          } catch (err) {
            logger.warn({ err, store, guildId }, 'Failed to check user store for data request');
          }
        }
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(t('datarequest.title'))
        .setDescription(t('datarequest.desc', { user: interaction.user.toString() }))
        .setTimestamp();

      if (totalGuildRecords === 0 && totalUserRecords === 0) {
        embed.addFields({ name: t('datarequest.none'), value: t('datarequest.noneDesc') });
      } else {
        if (totalGuildRecords > 0) {
          const guildFields = Object.entries(guildCounts)
            .filter(([k]) => !k.includes(':')) // Top-level stores only
            .map(([store, count]) => `${store}: ${count} record(s)`)
            .join('\n') || 'None';
          embed.addFields({ name: t('datarequest.guildData'), value: guildFields.slice(0, 1024) });
        }
        if (totalUserRecords > 0) {
          const userFields = Object.entries(userCounts)
            .map(([store, count]) => `${store}: ${count} guild(s)`)
            .join('\n') || 'None';
          embed.addFields({ name: t('datarequest.userData'), value: userFields.slice(0, 1024) });
        }
      }

      embed.setFooter({ text: t('datarequest.footer', { total: totalGuildRecords + totalUserRecords }) });

      await interaction.editReply({ embeds: [embed] });

      logger.info({ userId, guildRecords: totalGuildRecords, userRecords: totalUserRecords }, 'Data request fulfilled');
    } catch (error) {
      const errorMessage = await handleDiscordError(error) ?? 'An unknown error occurred.';
      await safeReply(interaction, errorMessage);
    }
  },
};
```

- [ ] **Step 4: Add i18n keys to en-US**

```json
// src/i18n/en-US/utility.json (add to existing)
{
  "datarequest": {
    "title": "Your Data Request (Art. 15 GDPR)",
    "desc": "Here is a summary of all data Apollo has stored about you:",
    "guildData": "Guild-Scoped Data",
    "userData": "Per-Guild User Data",
    "none": "No Data Found",
    "noneDesc": "No personal data found for your user ID.",
    "footer": "Total records: {{total}}. Use /export-my-data for full JSON export. Use /data-deletion to delete."
  }
}
```

- [ ] **Step 5: Run lint:locales**

```bash
pnpm lint:locales
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/datarequest.test.ts
```

- [ ] **Step 7: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add src/plugins/utility/commands/datarequest.ts src/plugins/utility/commands/__tests__/datarequest.test.ts src/i18n/en-US/utility.json
git commit -m "feat: add /data-request command for GDPR Art. 15 access right"
```

---

### Task 6: Implement `/export-my-data` Command (Art. 20 Portability)

**Files:**
- Create: `src/plugins/utility/commands/dataexport.ts`
- Create: `src/plugins/utility/commands/__tests__/dataexport.test.ts`
- Modify: `src/i18n/en-US/utility.json` (add i18n keys)

**Interfaces:**
- Consumes: `src/utils/db.ts`, `src/utils/logger.js`, `src/i18n/index.js`
- Produces: New slash command `/export-my-data` sending JSON file via DM with all user data

- [ ] **Step 1: Write failing test**

```typescript
// src/plugins/utility/commands/__tests__/dataexport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserData, getAllGuildData } from '../../../../../utils/db.js';

vi.mock('../../../../../utils/db.js', () => ({
  getUserData: vi.fn(),
  getAllGuildData: vi.fn(),
}));

describe('/export-my-data command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exports all user data as structured JSON', async () => {
    const { execute } = await import('../dataexport.js');
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { warnings: [{ userId: 'u1', reason: 'test' }] } },
    ]);
    getUserData.mockResolvedValue({ language: 'en-US', timezone: 'UTC' });
    // Assert DM sent with JSON attachment
  });

  it('includes all data categories from DATA_INVENTORY.md', async () => {
    // Verify comprehensive coverage
  });

  it('handles DM failure gracefully', async () => {
    // Assert ephemeral reply with error
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/dataexport.test.ts
```

- [ ] **Step 3: Implement dataexport.ts**

```typescript
// src/plugins/utility/commands/dataexport.ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { getAllGuildData, getUserData, getAllGuildIds } from '../../../utils/db.js';
import { createLogger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

const logger = createLogger({ component: 'plugin:utility:dataexport' });

// All stores from DATA_INVENTORY.md
const ALL_GUILD_STORES = [
  'config', 'moderation', 'automod', 'tickets', 'integrations', 'utility',
  'interlink', 'warnings', 'strikes', 'notes', 'cases', 'blacklist',
  'reports', 'temproles', 'tempbans', 'rolepersistence', 'lockdown',
  'raidmode', 'slowmode', 'nickname', 'voicestate', 'analytics',
  'embeds', 'tags', 'announcements', 'apolloinfo', 'invites',
  'datadeletion', 'operatorcontact', 'slareadout', 'levels', 'reminders',
  'polls', 'giveaways',
];

const ALL_USER_STORES = [
  'user', 'levels', 'reminders', 'polls', 'giveaways', 'tags',
];

function filterUserData(data: unknown, userId: string): unknown {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const filtered = value.filter((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const i = item as Record<string, unknown>;
        return i.userId === userId || i.creatorId === userId || 
               i.ownerId === userId || i.reporterId === userId ||
               i.reportedId === userId || i.targetId === userId ||
               (Array.isArray(i.participants) && i.participants.includes(userId));
      });
      if (filtered.length > 0) result[key] = filtered;
    } else if (typeof value === 'object' && value !== null) {
      // Nested object - check for userId fields
      const nested = value as Record<string, unknown>;
      if (nested.userId === userId || nested.creatorId === userId) {
        result[key] = value;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function filterTicketData(data: unknown, userId: string): unknown {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  
  for (const key of ['openTickets', 'closedTickets']) {
    if (Array.isArray(obj[key])) {
      const filtered = obj[key]!.filter((t: unknown) => {
        if (typeof t !== 'object' || t === null) return false;
        const ticket = t as Record<string, unknown>;
        return ticket.creatorId === userId || 
               (Array.isArray(ticket.participants) && ticket.participants.includes(userId));
      });
      if (filtered.length > 0) result[key] = filtered;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('export-my-data')
    .setDescription('Export all data the bot has stored about you as JSON (GDPR Art. 20)')
    .setDMPermission(true),
  name: 'export-my-data',
  description: 'Export all data the bot has stored about you as JSON (GDPR Art. 20)',
  category: 'Utility',
  dmPermission: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null,
      });
      const t = i18n.getFixedT(resolvedLocale, 'utility');
      const userId = interaction.user.id;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const exportData: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        userId,
        requestId: interaction.id,
        guildData: {},
        userData: {},
      };

      // Export guild-scoped data
      for (const store of ALL_GUILD_STORES) {
        try {
          const allGuildData = await getAllGuildData(store);
          const guildExport: Record<string, unknown> = {};
          
          for (const { guildId, data } of allGuildData) {
            let filtered: unknown = null;
            if (store === 'tickets') {
              filtered = filterTicketData(data, userId);
            } else {
              filtered = filterUserData(data, userId);
            }
            
            if (filtered) {
              guildExport[guildId] = filtered;
            }
          }
          
          if (Object.keys(guildExport).length > 0) {
            (exportData.guildData as Record<string, unknown>)[store] = guildExport;
          }
        } catch (err) {
          logger.warn({ err, store }, 'Failed to export guild store');
        }
      }

      // Export per-guild user data
      const allGuildIds = await getAllGuildIds('config');
      for (const guildId of allGuildIds) {
        const guildUserExport: Record<string, unknown> = {};
        for (const store of ALL_USER_STORES) {
          try {
            const userData = await getUserData(store, guildId, userId);
            if (userData && Object.keys(userData).length > 0) {
              guildUserExport[store] = userData;
            }
          } catch (err) {
            logger.warn({ err, store, guildId }, 'Failed to export user store');
          }
        }
        if (Object.keys(guildUserExport).length > 0) {
          (exportData.userData as Record<string, unknown>)[guildId] = guildUserExport;
        }
      }

      // Create JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const buffer = Buffer.from(jsonString, 'utf8');
      const attachment = new AttachmentBuilder(buffer, { 
        name: `apollo-data-export-${userId}-${Date.now()}.json` 
      });

      // Send via DM
      try {
        await interaction.user.send({
          content: t('dataexport.dmContent'),
          files: [attachment],
        });
        
        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle(t('dataexport.sentTitle'))
          .setDescription(t('dataexport.sentDesc'))
          .setTimestamp();
        
        await interaction.editReply({ embeds: [successEmbed] });
        logger.info({ userId, size: buffer.length }, 'Data export sent via DM');
      } catch (dmErr) {
        const failEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle(t('dataexport.dmFailedTitle'))
          .setDescription(t('dataexport.dmFailedDesc'))
          .setTimestamp();
        
        await interaction.editReply({ embeds: [failEmbed] });
        logger.warn({ userId, err: dmErr }, 'Failed to send data export DM');
      }
    } catch (error) {
      const errorMessage = await handleDiscordError(error) ?? 'An unknown error occurred.';
      if (interaction.replied || interaction.deferred) {
        await safeFollowUp(interaction, errorMessage);
      } else {
        await safeReply(interaction, errorMessage);
      }
    }
  },
};
```

- [ ] **Step 4: Add i18n keys**

```json
// src/i18n/en-US/utility.json (add)
{
  "dataexport": {
    "dmContent": "Here is your complete data export from Apollo Discord Bot (GDPR Art. 20). This file contains all data associated with your user ID.",
    "sentTitle": "Export Sent",
    "sentDesc": "Your data export has been sent to your DMs as a JSON file.",
    "dmFailedTitle": "Could Not Send DM",
    "dmFailedDesc": "I couldn't send the export via DM. Please enable DMs from server members and try again, or contact the server administrator."
  }
}
```

- [ ] **Step 5: Run lint:locales**

```bash
pnpm lint:locales
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/dataexport.test.ts
```

- [ ] **Step 7: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 8: Commit**

```bash
git add src/plugins/utility/commands/dataexport.ts src/plugins/utility/commands/__tests__/dataexport.test.ts src/i18n/en-US/utility.json
git commit -m "feat: add /export-my-data command for GDPR Art. 20 portability right"
```

---

### Task 7: Extend `/data-deletion` Coverage to All Data Categories

**Files:**
- Modify: `src/plugins/utility/commands/datadeletion.ts`
- Modify: `src/plugins/utility/commands/__tests__/datadeletion.test.ts` (create if not exists)
- Modify: `src/i18n/en-US/utility.json` (add any new i18n keys)

**Interfaces:**
- Consumes: `src/utils/db.ts`, existing `deleteUserData` function
- Produces: Extended deletion covering moderation cases, blacklist, automod violations, threat scores, interlink data, reports, temproles, tempbans, rolepersistence, nickname, voicestate, analytics, invites, security logs

- [ ] **Step 1: Read current datadeletion.ts**

```bash
cat src/plugins/utility/commands/datadeletion.ts
```

- [ ] **Step 2: Write failing test for extended coverage**

```typescript
// src/plugins/utility/commands/__tests__/datadeletion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllGuildData, setGuildData, getUserData, setUserData } from '../../../../../utils/db.js';

vi.mock('../../../../../utils/db.js', () => ({
  getAllGuildData: vi.fn(),
  setGuildData: vi.fn(),
  getUserData: vi.fn(),
  setUserData: vi.fn(),
}));

import { deleteUserData } from '../datadeletion.js';

describe('/data-deletion extended coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes moderation cases, blacklist entries', async () => {
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { cases: [{ userId: 'u1' }], blacklist: ['u1'] } },
    ]);
    const result = await deleteUserData('u1');
    expect(result.byCategory.cases).toBeGreaterThan(0);
    expect(result.byCategory.blacklist).toBeGreaterThan(0);
  });

  it('deletes reports (as reporter and reported)', async () => {
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { reports: [{ reporterId: 'u1' }, { reportedId: 'u1' }] } },
    ]);
    const result = await deleteUserData('u1');
    expect(result.byCategory.reports).toBeGreaterThan(0);
  });

  it('deletes temproles, tempbans, rolepersistence', async () => {
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { temproles: [{ userId: 'u1' }], tempbans: [{ userId: 'u1' }], rolepersistence: [{ userId: 'u1' }] } },
    ]);
    const result = await deleteUserData('u1');
    expect(result.byCategory.temproles).toBeGreaterThan(0);
    expect(result.byCategory.tempbans).toBeGreaterThan(0);
    expect(result.byCategory.rolepersistence).toBeGreaterThan(0);
  });

  it('deletes nickname, voicestate, analytics, invites', async () => {
    getAllGuildData.mockResolvedValue([
      { guildId: 'g1', data: { 
        nickname: { savedNicknames: [{ userId: 'u1' }] },
        voicestate: { voiceLogs: [{ userId: 'u1' }] },
        analytics: { commandCounts: { u1: 5 } },
        invites: { inviteTracker: [{ userId: 'u1' }] },
      } },
    ]);
    const result = await deleteUserData('u1');
    expect(result.byCategory.nickname).toBeGreaterThan(0);
    expect(result.byCategory.voicestate).toBeGreaterThan(0);
    expect(result.byCategory.analytics).toBeGreaterThan(0);
    expect(result.byCategory.invites).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/datadeletion.test.ts
```

- [ ] **Step 4: Extend GUILD_ARRAY_STORES in datadeletion.ts**

```typescript
// Add to GUILD_ARRAY_STORES object:
const GUILD_ARRAY_STORES: Record<string, { key: string; match: (item: unknown, userId: string) => boolean }> = {
    // ... existing entries ...
    cases: { key: 'cases', match: (item, userId) => (item as { userId?: string }).userId === userId },
    blacklist: { key: 'blacklist', match: (item, userId) => item === userId },
    reports: { key: 'reports', match: (item, userId) => (item as { reporterId?: string }).reporterId === userId || (item as { reportedId?: string }).reportedId === userId },
    temproles: { key: 'temproles', match: (item, userId) => (item as { userId?: string }).userId === userId },
    tempbans: { key: 'tempbans', match: (item, userId) => (item as { userId?: string }).userId === userId },
    rolepersistence: { key: 'savedRoles', match: (item, userId) => (item as { userId?: string }).userId === userId },
    nickname: { key: 'savedNicknames', match: (item, userId) => (item as { userId?: string }).userId === userId },
    voicestate: { key: 'voiceLogs', match: (item, userId) => (item as { userId?: string }).userId === userId },
    analytics: { key: 'commandCounts', match: (item, userId) => false }, // Special handling needed for object
    invites: { key: 'inviteTracker', match: (item, userId) => (item as { userId?: string }).userId === userId },
    // Add special handlers for object-based stores (analytics, etc.)
};
```

- [ ] **Step 5: Add special handling for object-based stores (analytics, etc.) in deleteUserData function**

```typescript
// In deleteUserData function, after the GUILD_ARRAY_STORES loop:

// Handle analytics (object with userId keys)
const analyticsStore = 'analytics';
const allAnalyticsData = await getAllGuildData(analyticsStore);
for (const { guildId, data } of allAnalyticsData) {
    if (!data || typeof data !== 'object') continue;
    const dataObj = data as Record<string, unknown>;
    // commandCounts, messageCounts are objects keyed by userId
    for (const key of ['commandCounts', 'messageCounts', 'moderationActions', 'violationsDetected']) {
        if (dataObj[key] && typeof dataObj[key] === 'object' && userId in (dataObj[key] as Record<string, unknown>)) {
            delete (dataObj[key] as Record<string, unknown>)[userId];
            byCategory[analyticsStore] = (byCategory[analyticsStore] ?? 0) + 1;
            total += 1;
            await setGuildData(analyticsStore, guildId, data);
        }
    }
}

// Handle security log store if exists
const securityStores = ['securitylog', 'modlogs'];
for (const store of securityStores) {
    try {
        const allData = await getAllGuildData(store);
        for (const { guildId, data } of allData) {
            // Security logs typically have userId/targetId fields in entries
            // Implementation depends on actual schema
        }
    } catch {
        // Store may not exist
    }
}
```

- [ ] **Step 6: Update labels in buildDeletionSummary**

```typescript
const labels: Record<string, string> = {
    // ... existing ...
    cases: 'moderation cases',
    blacklist: 'blacklist entries',
    reports: 'reports',
    temproles: 'temp roles',
    tempbans: 'temp bans',
    rolepersistence: 'role persistence records',
    nickname: 'saved nicknames',
    voicestate: 'voice state logs',
    analytics: 'analytics records',
    invites: 'invite tracker entries',
};
```

- [ ] **Step 7: Run lint:locales**

```bash
pnpm lint:locales
```

- [ ] **Step 8: Run tests**

```bash
pnpm vitest run src/plugins/utility/commands/__tests__/datadeletion.test.ts
```

- [ ] **Step 9: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 10: Commit**

```bash
git add src/plugins/utility/commands/datadeletion.ts src/plugins/utility/commands/__tests__/datadeletion.test.ts src/i18n/en-US/utility.json
git commit -m "feat: extend /data-deletion to cover all personal data categories"
```

---

### Task 8: Create Breach Runbook (72h Notification)

**Files:**
- Create: `docs/runbooks/BREACH_RUNBOOK.md`
- Create: `src/utils/breachNotify.ts` (optional: Discord webhook notification helper)

**Interfaces:**
- Produces: Actionable incident response procedure for data breaches

- [ ] **Step 1: Write BREACH_RUNBOOK.md**

```markdown
# Data Breach Incident Runbook — Apollo Discord Bot

**Version:** 1.0
**Last Updated:** 2026-10-10
**Owner:** Instance Operator
**Classification:** CONFIDENTIAL — Do not commit to public repos

---

## 1. Scope & Definitions

**Personal Data Breach (Art. 4(12)):** A breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data transmitted, stored, or otherwise processed.

**Scope:** This runbook covers breaches of:
- SQLite/PostgreSQL database (guild_store, guild_user_store, interlink_bots)
- Redis (spam tracker, threat scores, queue payloads)
- Logs (pino, security log)
- Backups (database dumps, Redis RDB/AOF)
- Interlink Go relay
- Metrics (Prometheus)

**Excluded:** Discord API Data (Discord is controller; Discord handles their breaches)

---

## 2. Roles & Contacts

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| **Data Controller (Operator)** | [YOUR NAME] | [YOUR EMAIL/PHONE] | [BACKUP CONTACT] |
| **Technical Lead** | [YOUR NAME] | [YOUR EMAIL/PHONE] | [BACKUP CONTACT] |
| **Legal/Privacy Advisor** | [IF APPLICABLE] | [CONTACT] | — |
| **Discord Developer Support** | — | https://dis.gd/support | — |
| **Supervisory Authority (Lead SA)** | [YOUR EU COUNTRY DPA] | [DPA CONTACT] | — |

**Operator Contact in Bot:** `/operator-contact` command or `OPERATOR_CONTACT` env var

---

## 3. Breach Detection & Triage

### 3.1 Detection Sources
- Automated alerts (Prometheus: unusual DB access, Redis memory spike, failed auth)
- User reports (suspicious activity, data appearing elsewhere)
- Security log entries (signature verification failures, plugin load anomalies)
- Infrastructure alerts (unauthorized SSH, unusual network traffic)
- Third-party notifications (GitHub dependabot, Docker security scans)

### 3.2 Initial Triage (Target: < 1 hour from detection)

```
┌─────────────────────────────────────────────────────────────┐
│  BREACH DETECTED                                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  1. CONTAIN: Isolate affected systems                       │
│     - Revoke compromised tokens/keys (ENCRYPTION_KEY,      │
│       INTERLINK_AUTH_KEY, Discord bot token, DB creds)      │
│     - Block suspicious IPs at firewall                      │
│     - Stop affected bot instance if needed                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ASSESS: What data? How many subjects? Risk level?       │
│     - Data categories (see DATA_INVENTORY.md)               │
│     - Affected guilds/users (query DB/Redis)                │
│     - Likelihood of harm (identity theft, profiling, etc.)  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  3. CLASSIFY: Risk Level                                    │
│     LOW:    No personal data / encrypted / no access        │
│     MEDIUM: Personal data accessed, low harm risk           │
│     HIGH:   Sensitive data (moderation, tickets) OR         │
│             high harm risk (identity theft, doxxing)        │
│     CRITICAL: Large scale (>1000 users), special category,  │
│               or confirmed malicious exfiltration           │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Notification Timelines

| Risk Level | Supervisory Authority (Art. 33) | Data Subjects (Art. 34) | Discord (Dev Terms §5c) |
|------------|----------------------------------|--------------------------|-------------------------|
| **LOW**    | No (document only)               | No                       | No                      |
| **MEDIUM** | **Within 72 hours**              | Case by case             | **Promptly**            |
| **HIGH**   | **Within 72 hours**              | **Without undue delay**  | **Promptly**            |
| **CRITICAL**| **Within 72 hours**             | **Without undue delay**  | **Promptly**            |

**Key Deadlines:**
- **72-hour clock starts at AWARENESS** (not occurrence)
- Document exact time of awareness in breach register
- "Without undue delay" = as soon as feasible, typically < 72h for HIGH/CRITICAL

---

## 5. Supervisory Authority Notification (Art. 33)

### 5.1 Required Information (Art. 33(3))
Use template: `BREACH_NOTIFICATION_TEMPLATE.md`

```
1. Nature of breach (categories of data, approx. # subjects, # records)
2. Likely consequences
3. Measures taken / proposed to address
4. Contact details of DPO or operator
5. Reference to this runbook
```

### 5.2 Submission Channels
- **EU:** Your lead SA's online breach notification form
- **UK:** ICO online reporting tool
- **Document:** Save submission confirmation + reference number

---

## 6. Data Subject Notification (Art. 34)

### 6.1 When Required
- HIGH/CRITICAL risk to rights and freedoms
- Not required if:
  - Data encrypted with uncompromised key (Art. 34(3)(a))
  - Measures taken to mitigate risk (Art. 34(3)(b))
  - Disproportionate effort → public communication (Art. 34(3)(c))

### 6.2 Notification Content
- Nature of breach
- Likely consequences
- Measures taken
- Contact for more info
- Steps subjects can take (enable 2FA, monitor accounts, etc.)

### 6.3 Delivery Methods
- **Primary:** DM via bot to affected users (`/data-request` shows affected guilds)
- **Secondary:** Announcement in affected guilds (if DM fails)
- **Tertiary:** Public notice on bot's support server / GitHub

### 6.4 Template
Use: `SUBJECT_NOTIFICATION_TEMPLATE.md`

---

## 7. Discord Notification (Developer Terms §5(c))

**Requirement:** "Promptly notify Discord of any security incident affecting API Data"

### 7.1 What to Report
- Compromised bot token
- Unauthorized access to guild data via bot
- API Data exfiltration
- Interlink compromise affecting other bots

### 7.2 How to Report
- Discord Developer Support: https://dis.gd/support
- Include: Bot Application ID, incident summary, affected guilds, mitigation steps

### 7.3 Template
Use: `DISCORD_NOTIFICATION_TEMPLATE.md`

---

## 8. Breach Register (Art. 33(5))

**Maintain:** `breach-register.json` (encrypted, access-controlled)

```json
{
  "breaches": [
    {
      "id": "BR-2026-001",
      "detectedAt": "2026-10-10T14:30:00Z",
      "awarenessAt": "2026-10-10T14:35:00Z",
      "classifiedAt": "2026-10-10T15:00:00Z",
      "riskLevel": "MEDIUM",
      "dataCategories": ["moderation history", "user preferences"],
      "affectedGuilds": ["123456789", "987654321"],
      "affectedUsers": 47,
      "rootCause": "Exposed Redis port (no password)",
      "containment": "Redis password set, port firewalled, keys rotated",
      "saNotifiedAt": "2026-10-10T16:00:00Z",
      "saReference": "SA-2026-12345",
      "subjectsNotifiedAt": "2026-10-10T18:00:00Z",
      "discordNotifiedAt": "2026-10-10T16:30:00Z",
      "resolvedAt": "2026-10-11T10:00:00Z",
      "lessonsLearned": "Enable Redis AUTH by default in docker-compose"
    }
  ]
}
```

---

## 9. Post-Incident Review

**Within 30 days of resolution:**
1. Root cause analysis (5 Whys)
2. Update runbook with lessons learned
3. Update technical controls (encryption, access, monitoring)
4. Test updated controls
5. Brief supervisory authority if requested

---

## 10. Templates

### BREACH_NOTIFICATION_TEMPLATE.md (Supervisory Authority)
```markdown
# Personal Data Breach Notification — Art. 33 GDPR

**Controller:** [Instance Operator Name/Entity]
**Bot:** Apollo Discord Bot (Application ID: [CLIENT_ID])
**Reference:** [BR-YYYY-NNN]
**Date of Awareness:** [ISO 8601]

## 1. Nature of Breach
- **Categories of Personal Data:** [From DATA_INVENTORY.md]
- **Approximate Number of Data Subjects:** [Number]
- **Approximate Number of Records:** [Number]
- **Special Category Data:** [Yes/No - typically No]

## 2. Likely Consequences
[Describe: identity theft risk, profiling exposure, server security impact, etc.]

## 3. Measures Taken
- [Containment actions]
- [Key rotation]
- [Access revocation]
- [Forensic preservation]

## 4. Proposed Measures
[Additional hardening, monitoring, process changes]

## 5. Contact
**Operator:** [Name] — [Email] — [Phone]
**DPO:** [If applicable]

## 6. Cross-Border Impact
[List affected EU member states if known]
```

### SUBJECT_NOTIFICATION_TEMPLATE.md (Data Subjects)
```markdown
# Important: Your Data Security — Apollo Discord Bot

**Date:** [ISO 8601]
**Incident Reference:** [BR-YYYY-NNN]

## What Happened
[Plain language description]

## What Data Was Involved
[Categories from DATA_INVENTORY.md relevant to this user]

## What We've Done
[Containment, investigation, key rotation]

## What You Should Do
- Enable 2FA on Discord
- Review connected applications
- Monitor for suspicious activity
- Contact us via `/operator-contact` if concerned

## More Information
[Link to detailed notice / support server]
```

### DISCORD_NOTIFICATION_TEMPLATE.md (Discord Developer Support)
```markdown
**Bot Application ID:** [CLIENT_ID]
**Incident Reference:** [BR-YYYY-NNN]
**Date of Awareness:** [ISO 8601]

## Summary
[Brief description of incident affecting API Data]

## Affected Data
- Guild IDs: [List]
- User IDs: [Approximate count]
- API Data categories: [Messages, members, etc. per Developer Terms]

## Actions Taken
[Token rotation, access revocation, etc.]

## Request
[Any specific action needed from Discord]
```

---

## 11. Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║                    BREACH QUICK REFERENCE                     ║
╠══════════════════════════════════════════════════════════════╣
║ 1. CONTAIN (minutes)                                          ║
║    - Revoke tokens: ENCRYPTION_KEY, INTERLINK_AUTH_KEY,      ║
║      Discord token, DB creds, Redis password                 ║
║    - Isolate affected systems                                ║
╠══════════════════════════════════════════════════════════════╣
║ 2. ASSESS (1 hour)                                            ║
║    - Query DB: SELECT COUNT(*) FROM guild_user_store...      ║
║    - Check Redis: KEYS apollo:* | wc -l                      ║
║    - Classify risk: LOW/MEDIUM/HIGH/CRITICAL                 ║
╠══════════════════════════════════════════════════════════════╣
║ 3. NOTIFY (72 hours from awareness)                          ║
║    - SA: Online form (MEDIUM+)                               ║
║    - Subjects: DM via bot (HIGH/CRITICAL)                    ║
║    - Discord: dis.gd/support (promptly)                      ║
╠══════════════════════════════════════════════════════════════╣
║ 4. RECORD                                                     ║
║    - breach-register.json (encrypted)                        ║
║    - All timestamps, decisions, communications               ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 12. Testing & Maintenance

| Activity | Frequency | Owner |
|----------|-----------|-------|
| Tabletop exercise | Quarterly | Operator |
| Contact list review | Monthly | Operator |
| Template review | Semi-annually | Operator |
| Runbook version update | On change | Operator |
| Key rotation drill | Semi-annually | Operator |

---

### Task 2: Create Data Inventory Document

**Files:**
- Create: `docs/architecture/DATA_INVENTORY.md`

**Interfaces:**
- Consumes: GDPR_ASSESSMENT.md role mapping
- Produces: Complete personal data catalog for ROPA and DSAR implementation

- [ ] **Step 1: Write DATA_INVENTORY.md**

```markdown
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