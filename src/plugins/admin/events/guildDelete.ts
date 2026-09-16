// @ts-expect-error - JS file not yet migrated
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger({ component: 'admin:guildDelete' });

export default {
    name: 'guildDelete',
    once: false,
    async execute(guild: any, client: any) {
        try {
            logger.info(`[INFO] Bot removed from server: ${guild.name} (${guild.id})`);
            logger.info(`[INFO] Server had ${guild.memberCount} members`);

            // Note: We intentionally do NOT delete guild data immediately
            // Reasons:
            // 1. The bot might be temporarily removed and re-added
            // 2. Preserves warning history, blacklist, and configuration
            // 3. Server admins might want to restore their settings

            logger.info('[INFO] Guild data preserved for potential rejoin');
            logger.info(`[INFO] Now serving ${client.guilds.cache.size} servers`);

        } catch (error) {
            logger.error('[ERROR] guildDelete event error:', error);
        }
    }
};