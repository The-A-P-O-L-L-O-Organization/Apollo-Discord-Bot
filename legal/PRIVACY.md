# Apollo Discord Bot Privacy Policy

Last updated: 2026-08-14

This Privacy Policy describes how the Apollo Discord Bot ("the Bot", "the Software") processes data when you self-host it. The Bot is open-source software licensed under the GNU General Public License v3.0. There is no hosted service operated by the authors. When you run the Bot, you are the data controller for the data the Bot processes on your behalf.

## 1. Who Is the Data Controller

When you self-host the Bot, you, the operator of the instance, are the data controller for any personal data the Bot processes. The upstream author of the Bot is not a data controller for data processed by your self-hosted instance. If you have questions about how your data is handled, contact the operator of the instance you are interacting with.

If you are the operator and have questions about the upstream project, open an issue at the project's public repository.

Upstream author contact (for project questions only): Mitchell Sehenuk — mgs008@outlook.com. This address is not a contact channel for users of arbitrary self-hosted instances; each instance operator must publish their own contact information.

## 2. Scope

This Privacy Policy describes the data the Bot is capable of processing by default and through optional features. The actual data processed by any given instance depends on the features the operator has enabled, the configuration of those features, and the activity of users in the Discord servers where the Bot is installed.

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

The Bot does not assert a legal basis on your behalf. As the data controller, you are responsible for determining the legal basis for processing under the law applicable to you. In the United States, common bases include consent, legitimate operational purposes, and compliance with legal obligations.

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

## 14. How to Request Deletion

To request access to, correction of, or deletion of data the Bot has processed about you, you can use the `/data-deletion` slash command in any channel where the Bot is present, or in a direct message with the Bot. The command will show you what data is stored about you and let you delete it with a single confirmation.

Alternatively, contact the operator of the self-hosted instance you are interacting with. The operator is responsible for responding to your request and for deleting the data, unless retention is required by applicable law. If you do not know who operates the instance, ask a server administrator in the Discord server where you encountered the Bot.

## 15. Security Incidents

If the operator of a self-hosted instance becomes aware of an incident of unauthorized access to API Data processed by the Bot, the operator is responsible for notifying affected users and Discord in accordance with the Discord Developer Terms of Service (Section 5(c)) and applicable law. The upstream author is not responsible for incidents at self-hosted instances.
