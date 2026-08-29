// Guild Delete Event
// Triggered when the bot leaves a server or is kicked
// Optionally cleans up stored data (currently logs only, preserves data for potential rejoin)
import { createLogger } from '../../../utils/logger.js';
const logger = createLogger({ component: 'admin:guildDelete' });

    name: 'guildDelete',
    once: false,
    async execute(guild, client) {
        try {
            logger.info(`[INFO] Bot removed from server: ${guild.name} (${guild.id})`);
            logger.info(`[INFO] Server had ${guild.memberCount} members`);
            
            // Note: We intentionally do NOT delete guild data immediately
            // Reasons:
            // 1. The bot might be temporarily removed and re-added
            // 2. Preserves warning history, blacklist, and configuration
            // 3. Server admins might want to restore their settings
            //
            // If you want to implement automatic cleanup after X days,
            // you could add a "leftAt" timestamp to guild data and have
            // a periodic cleanup job that removes data older than 30 days.
            
            // Optional: Mark the guild as "inactive" with a timestamp
            // This allows future cleanup without losing data immediately
            // Uncomment the following if you want to implement this:
            /*
            import { updateGuildData } from '../utils/db.js';
            updateGuildData('_metadata', guild.id, (data) => ({
                ...data,
                leftAt: Date.now(),
                leftFrom: guild.name
            }));
            */
            
            logger.info('[INFO] Guild data preserved for potential rejoin');
            logger.info(`[INFO] Now serving ${client.guilds.cache.size} servers`);
            
        } catch (error) {
            logger.error('[ERROR] guildDelete event error:', error);
        }
    }
};
