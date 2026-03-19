// Guild Ban Remove Event
// Triggered when a user is unbanned from a guild (manual or bot-initiated)

import { logEvent } from '../utils/logger.js';

export default {
    name: 'guildBanRemove',
    once: false,
    async execute(ban, client) {
        try {
            // Fetch the ban to get the user
            const guild = ban.guild;
            const user = ban.user;
            
            if (!guild || !user) {
                console.log('[WARNING] guildBanRemove: Missing guild or user');
                return;
            }
            
            // Try to fetch audit log to get who unbanned the user
            let executor = null;
            
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 23, // MEMBER_BAN_REMOVE
                    limit: 1
                });
                
                const unbanLog = auditLogs.entries.first();
                if (unbanLog && unbanLog.target.id === user.id) {
                    executor = unbanLog.executor;
                }
            } catch (auditError) {
                console.log('[INFO] Could not fetch audit log for unban:', auditError.message);
            }
            
            // Create embed for logging
            const embed = {
                color: 0x00FF00, // Green
                title: '[MODERATION] Member Unbanned',
                description: `${user.tag} was unbanned from the server.`,
                fields: [
                    {
                        name: '[INFO] User',
                        value: `${user.tag} (${user.id})`,
                        inline: true
                    },
                    {
                        name: '[INFO] Unbanned By',
                        value: executor ? `${executor.tag}` : 'Unknown',
                        inline: true
                    }
                ],
                thumbnail: {
                    url: user.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date().toISOString()
            };
            
            // Log the unban event
            await logEvent(guild, 'unban', embed);
            
            console.log(`[MODERATION] User ${user.tag} was unbanned from ${guild.name}`);
            
        } catch (error) {
            console.error('[ERROR] guildBanRemove event error:', error);
        }
    }
};
