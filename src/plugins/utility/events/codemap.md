Responsibility
Handles Discord events for the utility plugin, processing messageCreate events to award experience points and announce level-ups.

Design
Implements the Discord event listener pattern via an exported object with properties: name (event identifier), once (boolean indicating single-use listener), and execute (async handler function). Utilizes utility functions from the XP module for configuration retrieval, cooldown checking, and XP awarding. Uses Discord.js EmbedBuilder for rich message formatting.

Flow
1. Discord client emits messageCreate event.
2. Event handler execute(message, client) invoked.
3. Ignores messages from DMs or bot authors.
4. Retrieves guild-specific levels configuration via getLevelsConfig.
5. Exits if XP system disabled for guild.
6. Checks cooldown via isOnCooldown; exits if on cooldown.
7. Calculates random XP amount within configured range.
8. Awards XP via awardXp, receiving updated user data and leveledUp flag.
9. If leveledUp and announcements enabled, constructs and sends level-up embed to channel.
10. Errors caught and logged to console.

Integration
Dependencies: discord.js (EmbedBuilder), ../../../utils/xp.js (getLevelsConfig, isOnCooldown, awardXp), ../../../utils/logger.js.
Consumed by: Discord client event registration system (typically in bot initialization) which registers the listener for the 'messageCreate' event.