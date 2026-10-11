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
