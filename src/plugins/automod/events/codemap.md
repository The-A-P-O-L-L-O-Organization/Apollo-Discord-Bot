Responsibility
Handles automoderation checks on incoming guild messages, evaluates configured rule sets, processes violations, applies warnings and automatic punishments, and logs moderation actions.

Design
Uses the Discord.js event listener pattern with a single exported execute function. Implements a modular check pipeline where each rule is a separate utility function. Centralized violation handling via handleViolation function. Configuration-driven feature flags and thresholds.

Flow
1. Event triggered on messageCreate.
2. Ignore direct messages.
3. Increment analytics tracking for the message.
4. Retrieve guild-specific automod configuration.
5. Exit if automod disabled or channel/exempt user.
6. Sequentially evaluate checks in order: account age, banned words, invite links, external links, mention spam, caps spam, message spam, AI moderation, NSFW attachments.
7. On first violating check (except account age which warns only), invoke handleViolation with violation type and reason.
8. handleViolation:
   a. Track violation analytics and flush critical data.
   b. Delete offending message if configured.
   c. Generate warning object and append to user's warning list.
   d. Send temporary warning embed to channel.
   e. Check warning thresholds for auto‑punishment (ban, kick, mute) and apply if applicable.
   f. Log action to moderation channel via sendModLog.
9. Errors are caught and logged at both check and violation handling stages.

Integration
Dependencies: discord.js, ../../../utils/automod.js, ../../../utils/db.js, ../../../utils/modLog.js, ../../../config/config.js, ../../../utils/analyticsCollector.js, ../../../utils/openaiModeration.js, ../../../utils/nsfwDetection.js.
Consumed by: Discord client event registration (implicitly via the bot's event loader).