# Apollo Discord Bot Privacy Policy

Last updated: 2026-10-11

This Privacy Policy describes how the Apollo Discord Bot ("the Bot", "the Software") processes data when you self-host it. The Bot is open-source software licensed under the GNU General Public License v3.0. There is no hosted service operated by the authors. When you run the Bot, you are the data controller for the data the Bot processes on your behalf.

This policy serves as the information notice required by GDPR Articles 13 and 14 where the GDPR applies. See Section 2A for first-interaction notice details.

## 1. Who Is the Data Controller

When you self-host the Bot, you, the operator of the instance, are the data controller for any personal data the Bot processes. The upstream author of the Bot is not a data controller for data processed by your self-hosted instance. If you have questions about how your data is handled, contact the operator of the instance you are interacting with.

If you are the operator and have questions about the upstream project, open an issue at the project's public repository.

Upstream author contact (for project questions only): Mitchell Sehenuk — mgs008@outlook.com. This address is not a contact channel for users of arbitrary self-hosted instances; each instance operator must publish their own contact information.

## 2. Scope

This Privacy Policy describes the data the Bot is capable of processing by default and through optional features. The actual data processed by any given instance depends on the features the operator has enabled, the configuration of those features, and the activity of users in the Discord servers where the Bot is installed.

## 2A. Information Notice at First Interaction (GDPR Art. 13/14)

Where the GDPR applies (see GDPR_ASSESSMENT.md: the Bot is offered worldwide via Discord and GDPR applies if any EU/EEA user is present), the operator as data controller must provide this information to data subjects at or before first interaction:

- Identity and contact details of the controller: the instance operator, reachable via the `/operator-contact` command or the operator-published contact in Section 12.
- Purposes and lawful bases of processing: listed per purpose in Section 5.
- Categories of personal data: listed in Section 3 and detailed in DATA_INVENTORY.md.
- Recipients: Discord, configured third-party services (Section 3.7), peer bots via Interlink where enabled, and processors hosting the database, Redis, logs, or metrics (see Data Flow Summary below).
- Retention periods: listed in Section 6.
- Data subject rights (Art. 15-22): listed in Section 9, exercisable via `/data-deletion` or by contacting the operator.
- Right to lodge a complaint with a supervisory authority (Art. 77).
- Whether provision of data is a statutory or contractual requirement, and consequences of failure to provide it: use of Discord and interaction with the Bot is voluntary; declining to interact limits access to Bot features in that guild.
- Existence of automated decision-making (Art. 22): described in Section 13b.

Operators SHOULD surface a link to this policy at first interaction, for example in a welcome message, a rules channel, or a reply to the first command invocation. The canonical privacy policy URL for an instance must be published by the operator and registered in the Discord Developer Portal (https://discord.com/developers/applications) under the application's Privacy Policy URL field.

## 3. Data the Bot Processes

The Bot processes the following categories of data when interacting with Discord and with optional third-party services. Categories marked "optional" are only processed when the corresponding feature is enabled.

### 3.1 Discord Data (Always Processed When the Bot Is Installed)

- Guild identifiers (server IDs), channel identifiers, and role identifiers.
- User identifiers (Discord user IDs), display names, usernames, and discriminators.
- Member join and leave events, including the user who performed the action and the affected user.
- Message content, including text, attachments, embeds, and reactions, when the Bot reads messages for moderation, translation, logging, command handling, or analytics.
- Voice state changes, including channel joins, leaves, and mute/deafen events.
- Presence updates, when the GuildPresences intent is enabled.
- Audit log entries, including the executor and target of moderation actions.
- Display avatars, server profile banners, and other public profile fields the Bot accesses.

### 3.2 Moderation Data (Optional)

- Warnings, strikes, and notes recorded against users, including the moderator, reason, and timestamp.
- Ban, kick, mute, and timeout records, including the moderator, target, reason, and duration.
- Reports submitted by users, including the reporter, the reported user, the channel, the message ID, and the reason.
- Saved nicknames and saved roles for role-persistence on rejoin.
- Global blacklist entries, when the global blacklist feature is enabled.

### 3.3 Utility Data (Optional)

- Experience points and level per user per guild.
- Polls, including the creator, options, votes per option, and whether the poll is anonymous.
- Reminders, including the user, message, channel, and reminder time.
- Giveaways, including the creator, prize, entrants, and winner.
- Tags, scheduled announcements, and other operator-configured content.

### 3.4 Ticket Data (Optional)

- Ticket records, including the creator, channel, category, priority, assigned staff, participants, status, first-response time, close time, close reason, and rating.
- Ticket transcripts, written to disk when a ticket is closed.

### 3.5 Analytics Data (Optional)

- Aggregated counts of commands invoked, messages processed, moderation actions taken, and violations detected, per guild and per user.
- Retention: 90 days by default. The operator may export or delete analytics data at any time.

### 3.6 Logs (Optional)

- Moderation log entries, including message delete and edit events with old and new content, member join and leave events, role changes, voice changes, bulk message deletes, and moderation actions. Logs are sent to a per-guild log channel configured by the operator.
- Security log entries, including plugin load events, signature verification failures, and other security-relevant events. Retention: 90 days by default, configurable via `SECURITY_LOG_RETENTION_DAYS`.

### 3.7 Third-Party Service Data (Optional)

When the corresponding integration is enabled, the Bot sends data to the following third-party services:

- OpenAI Moderation API: message content is sent to OpenAI for moderation scoring. Disabled when `OPENAI_API_KEY` is not set.
- Argos Translate: message content is sent to the configured translation endpoint for translation.
- Twitch: the Bot polls Twitch for stream status using your Twitch client credentials. No Discord user data is sent to Twitch.
- YouTube: the Bot queries YouTube for video metadata using your YouTube API key. No Discord user data is sent to YouTube.
- GitHub: the Bot receives webhook payloads from GitHub on a local HTTP server. No Discord user data is sent to GitHub.
- Peer bots via the Interlink plugin: the Bot exchanges events with peer bots you have registered, using bearer-token-authenticated HTTPS requests. The events forwarded are configurable.

## 4. Purposes of Processing

The Bot processes the data described above for the following purposes:

- Operating the features the operator has enabled, including moderation, logging, analytics, translation, NSFW detection, tickets, giveaways, polls, reminders, and integrations.
- Enforcing the operator's rules and Discord's Terms of Service.
- Generating aggregated statistics about Bot usage.
- Communicating with third-party services the operator has configured.
- Communicating with peer bots the operator has registered via the Interlink plugin.

## 5. Legal Basis

Where the GDPR applies, the operator as data controller relies on the following lawful bases under GDPR Article 6 for each processing purpose (see LAWFUL_BASIS_LIA.md for full assessments):

| Purpose | Lawful Basis (GDPR Art. 6) |
|---------|---------------------------|
| Guild configuration storage (settings, channels, roles) | Art. 6(1)(f) Legitimate Interest: operating the Bot for the guild |
| User preference storage (language, timezone, notifications) | Art. 6(1)(b) Contract (user invokes commands) / Art. 6(1)(a) Consent |
| Moderation history (warnings, bans, kicks, notes, cases) | Art. 6(1)(f) Legitimate Interest: server safety and order |
| Ticket management (creation, transcripts, participants) | Art. 6(1)(b) Contract (user requests support) / Art. 6(1)(f) Legitimate Interest |
| Utility features (levels, polls, reminders, giveaways, tags) | Art. 6(1)(f) Legitimate Interest: community engagement; participation is voluntary |
| Automod rule enforcement (banned words, links, spam, invites) | Art. 6(1)(f) Legitimate Interest, subject to LIA 1 and Art. 22 safeguards (Section 13b) |
| Threat scoring and spam profiling | Art. 6(1)(f) Legitimate Interest, subject to LIA 2 and safeguards (Section 13b) |
| Interlink cross-bot event sharing | Art. 6(1)(f) Legitimate Interest, subject to LIA 3; joint-controller arrangement under Art. 26 where applicable |
| NSFW image detection | Art. 6(1)(f) Legitimate Interest: safety; no personal data extracted from images |
| Analytics and metrics aggregation | Art. 6(1)(f) Legitimate Interest: operational visibility; pseudonymized where possible |
| Security logging and audit trail | Art. 6(1)(f) Legitimate Interest / Art. 6(1)(c) Legal Obligation |
| Data deletion request handling | Art. 6(1)(c) Legal Obligation: compliance with GDPR Art. 17/19 and DSAR duties under Art. 12 |

Discord API Data (messages, members, guilds received via the gateway) is controlled by Discord Netherlands B.V. under the Discord Developer Terms; the Bot receives it as processor. Special category data under GDPR Art. 9 is not processed: NSFW detection does not extract biometric, health, racial, political, religious, or sexual-orientation data, and moderation records reflect guild rule violations, not criminal convictions under Art. 10.

Where the GDPR does not apply, the operator as data controller is responsible for determining the lawful basis under applicable law. In the United States, common bases include consent, legitimate operational purposes, and compliance with legal obligations.

## 6. Retention

Retention periods depend on the data category and the operator's configuration:

- Moderation records: retained until the operator deletes them.
- Utility data (XP, polls, reminders, giveaways, tags): retained until the operator deletes them or the underlying record is removed.
- Ticket records and transcripts: retained until the operator deletes them.
- Analytics data: 90 days by default.
- Security log: 90 days by default, configurable via `SECURITY_LOG_RETENTION_DAYS`.
- Moderation log: retained until the operator deletes the log channel or clears the log.

The operator may export or delete data at any time using the Bot's built-in commands and database access.

## 7. Storage and Security

The Bot stores data in a local SQLite database by default, with an optional PostgreSQL backend. The Bot may also store data in JSON files under the `data/` directory. The operator is responsible for securing the host on which the Bot runs, including:

- Restricting access to the host and to the database.
- Keeping the Discord bot token, API keys, and database credentials secret.
- Configuring backups of the database.
- Configuring HTTPS and authentication for any exposed endpoints.

The Bot implements the following security controls by default:

- SSRF protection on outbound HTTP requests via `safeFetch`.
- A startup check that refuses to run without a Discord bot token.
- bcrypt-hashed API keys for the Interlink plugin.
- HMAC-SHA256 signature verification for GitHub webhooks.
- The Interlink HTTP server binds to localhost (127.0.0.1) by default.
- Bearer-token authentication and rate limiting on the Interlink HTTP server.

## 8. Children's Data

Discord's Terms of Service require users to be at least 13 years old. The Bot does not knowingly process data of users under 13. If you believe the Bot has processed data of a user under 13, contact the operator of the instance to request deletion.

## 9. Your Rights

Your rights with respect to data processed by a self-hosted instance depend on the law applicable to you. In the United States, there is no comprehensive federal privacy law, but state laws (such as the California Consumer Privacy Act) may grant you specific rights. To exercise any rights you may have, contact the operator of the instance directly. The operator is the data controller and is responsible for responding to your request.

Where the GDPR applies, you have the following rights:

- Art. 15 Right of access: obtain confirmation of processing and a copy of your personal data. Contact the operator; partial self-service via `/data-deletion` (view stored data).
- Art. 16 Right to rectification: correct inaccurate data or complete incomplete data. Contact the operator.
- Art. 17 Right to erasure: request deletion where Art. 17(1) grounds apply. Use `/data-deletion` or contact the operator.
- Art. 18 Right to restriction of processing: request restriction where Art. 18(1) conditions apply. Contact the operator.
- Art. 19 Notification obligation: the operator will communicate rectification, erasure, or restriction to recipients where required.
- Art. 20 Right to data portability: receive or transmit your data in a structured, commonly used, machine-readable format where Art. 20(1) applies. Contact the operator.
- Art. 21 Right to object: object to processing based on Art. 6(1)(f) legitimate interests, including profiling, on grounds relating to your particular situation. Contact the operator.
- Art. 22 Rights on automated decision-making: not to be subject to solely automated decisions with legal or similarly significant effects; see Section 13b for automod and threat-scoring safeguards, human review, and appeal.
- Art. 7(3) Right to withdraw consent: where processing relies on consent, withdraw it at any time without affecting prior lawful processing. Contact the operator or use applicable opt-out commands.
- Art. 77 Right to lodge a complaint with a supervisory authority in your EU/EEA member state.

The operator must respond without undue delay and in any event within one month (Art. 12(3)), extendable by two further months for complex requests.

## 10. International Transfers

When the operator enables third-party integrations, data may be transferred to and processed in countries other than the country in which the data was collected. The operator is responsible for ensuring that any such transfers comply with applicable law.

## 11. Changes to This Policy

The authors may update this Privacy Policy from time to time. Material changes will be reflected by updating the "Last updated" date at the top of this document. Operators are encouraged to review this policy when updating the Bot and to inform their users of any material changes.

## 12. Contact

For questions about this Privacy Policy or to exercise your rights, contact the operator of the self-hosted instance you are interacting with. The operator is the data controller and is responsible for responding to your request. You can view the operator's published contact information by running the `/operator-contact` slash command in any channel where the Bot is present, or in a direct message with the Bot.

Upstream author contact (for project questions only): Mitchell Sehenuk — mgs008@outlook.com. This address is not a contact channel for users of arbitrary self-hosted instances; each instance operator must publish their own contact information.

## 13. Compliance with Discord

This Privacy Policy is intended to be consistent with the Discord Developer Terms of Service (https://support-dev.discord.com/hc/en-us/articles/8562894815383) and the Discord Developer Policy (https://support-dev.discord.com/hc/en-us/articles/8563934450327). In the event of a conflict between this Privacy Policy and Discord's Developer Terms or Developer Policy, Discord's terms control with respect to the processing of Discord API Data.

## 13a. Operator Acceptance

Before operating a self-hosted instance of the Bot, you must read this Privacy Policy and the Terms of Service in `legal/TOS.md` in full. The Bot enforces this requirement: it will refuse to start unless `OPERATOR_AGREEMENT=true` is set in your `.env` file. By setting this variable, you affirm that you have read both documents and accept the operator responsibilities described in the Terms of Service, including your role as data controller for any personal data the Bot processes on your behalf.

## 13b. Automated Decision-Making (GDPR Art. 22)

The Bot performs automated evaluation with the following safeguards (see LAWFUL_BASIS_LIA.md, LIAs 1-2):

- Automod rule enforcement (banned words, links, invites, spam, raid protection): message content is scanned only in guilds where automod is enabled, subject to exempt roles and channels. Low-impact actions (message deletion, short timeouts) may apply automatically. Significant actions (ban, timeout exceeding 1 hour) require human review by a guild moderator before or promptly after application.
- Threat scoring and spam profiling: per-user behavioral scores are guild-scoped, decay automatically over time, and are not shared outside the guild unless Interlink event sharing is explicitly enabled. Scores inform moderator decisions and are never the sole basis for a ban or long timeout without human review.
- Logic and consequences: scoring factors are message frequency, violation history, join patterns, and configured thresholds. Consequences range from no action to stricter filtering to moderator alert to automated low-impact action as above.
- Your rights: request human intervention, express your point of view, contest the decision, and appeal to a guild moderator. Contact the operator of the instance or a server administrator. Automod configuration is published to guild administrators via the log channel and bot configuration.
- Required operator action: maintain configurable thresholds, exempt roles/channels, and a documented appeal path; apply a rolling retention window (for example 30 days) with auto-decay for threat scores.

## 13c. Data Protection Impact Assessment Summary

Automod enforcement, threat scoring, and Interlink event sharing involve systematic evaluation and large-scale monitoring that may trigger a DPIA duty under GDPR Art. 35. Operators SHOULD assess whether a DPIA is required for their deployment considering the nature, scope, context, and purposes of processing, and document necessity, proportionality, risks to data subjects, and mitigations (data minimization, guild scoping, retention limits, human review, appeal paths, Art. 26 arrangements for Interlink). Where processing is likely to result in high risk that cannot be mitigated, the operator must consult the supervisory authority under Art. 36 before proceeding.

## 13d. Data Protection Officer (GDPR Art. 37-39)

No Data Protection Officer is appointed for the upstream project, because the upstream authors operate no hosted service and are not a controller for self-hosted instances. Each instance operator as sole controller must assess whether Art. 37 requires appointment of a DPO (for example where core activities consist of large-scale regular and systematic monitoring). Where no DPO is required, the operator remains the contact point for data protection matters via Section 12. Where a DPO is appointed, the operator must publish the DPO's contact details alongside the operator contact.

## 13e. EU Representative (GDPR Art. 27)

Where the operator as controller is established outside the EEA and Art. 3(2) applies (offering the Bot to users in the EEA), the operator must designate in writing a representative established in an EEA member state where data subjects are located, unless an Art. 27(2) exemption applies. The operator must publish the representative's identity and contact details alongside the operator contact in Section 12.

## 13f. Privacy Policy URL

Each operator must publish this policy (or an adapted instance-specific copy identifying the controller, contact, DPO if any, and EU representative if any) at a stable public URL and register it as the Privacy Policy URL in the Discord Developer Portal (https://discord.com/developers/applications) for their application. Users can obtain the operator's published policy URL and contact information via the `/operator-contact` command.

## 14. How to Request Deletion

To request access to, correction of, or deletion of data the Bot has processed about you, you can use the `/data-deletion` slash command in any channel where the Bot is present, or in a direct message with the Bot. The command will show you what data is stored about you and let you delete it with a single confirmation.

Alternatively, contact the operator of the self-hosted instance you are interacting with. The operator is responsible for responding to your request and for deleting the data, unless retention is required by applicable law. If you do not know who operates the instance, ask a server administrator in the Discord server where you encountered the Bot.

## 15. Security Incidents

If the operator of a self-hosted instance becomes aware of an incident of unauthorized access to API Data processed by the Bot, the operator is responsible for notifying affected users and Discord in accordance with the Discord Developer Terms of Service (Section 5(c)) and applicable law. The upstream author is not responsible for incidents at self-hosted instances.
