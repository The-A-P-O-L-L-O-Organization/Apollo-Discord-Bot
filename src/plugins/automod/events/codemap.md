Responsibility
Handles automoderation checks on incoming guild messages, evaluates configured rule sets, processes violations, applies warnings and automatic punishments, and logs moderation actions.

Design
Uses the Discord.js event listener pattern with a single exported execute function. Implements a modular check pipeline where each rule is a separate utility function imported from ../../../utils/automod.js and other utility modules. Centralized violation handling via handleViolation function. Configuration-driven feature flags and thresholds. Uses Redis-backed spam tracking when enabled, raid detection, phishing link detection, and AI moderation.

Flow
1. Event triggered on messageCreate.
2. Ignore direct messages.
3. Track message for analytics.
4. Retrieve guild-specific automod configuration.
5. Exit if automod disabled or channel/exempt user.
6. Run per-user violation cooldown check (skip if violation in last 5 seconds).
7. Check account age (warn only, does not delete message).
8. Check banned words (if enabled).
9. Check invite links (if enabled).
10. Check external links (if enabled).
11. Check phishing links (if enabled).
12. Check mention spam (if enabled).
13. Check caps spam (if enabled).
14. Check message spam (Redis-backed or in-memory, if enabled).
15. Check raid detection (if enabled).
16. Check AI moderation (OpenAI Moderation API, if enabled).
17. Check NSFW image attachments (if enabled and attachments present).
18. On first violating check (except account age and raid detection which warn only), invoke handleViolation with violation type, reason, and delete flag.
19. handleViolation:
    a. Track violation for analytics and set violation cooldown.
    b. Flush critical analytics immediately.
    c. Delete offending message if requested and deletable.
    d. Generate warning object and append to user's warning list.
    e. Send temporary warning embed to channel (deleted after 10 seconds).
    f. Check warning thresholds for auto‑punishment (ban, kick, mute) and apply if applicable.
    g. Log action to moderation channel via sendModLog.
20. Errors are caught and logged at both check and violation handling stages.

Integration
Dependencies: discord.js, ../../../utils/automod.js, ../../../utils/db.js, ../../../utils/modLog.js, ../../../config/config.js, ../../../utils/analyticsCollector.js, ../../../utils/openaiModeration.js, ../../../utils/nsfwDetection.js, ../../../utils/raidDetection.js, ../../../utils/lock.js.
Consumed by: Discord client event registration (implicitly via the bot's event loader).