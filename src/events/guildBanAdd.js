// Guild Ban Add Event
// Triggered when a user is banned from a guild (manual or bot-initiated)

import { logEvent } from '../utils/logger.js';

export default {
    name: 'guildBanAdd',
    once: false,
    async execute(ban, client) {
        try {
            // Fetch the ban to get the user and reason
            const guild = ban.guild;
            const user = ban.user;
            
            if (!guild || !user) {
                console.log('[WARNING] guildBanAdd: Missing guild or user');
                return;
            }
            
            // Try to fetch audit log to get who banned the user
            let executor = null;
            let reason = ban.reason || 'No reason provided';
            
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 22, // MEMBER_BAN_ADD
                    limit: 1
                });
                
                const banLog = auditLogs.entries.first();
                if (banLog && banLog.target.id === user.id) {
                    executor = banLog.executor;
                    reason = banLog.reason || reason;
                }
            } catch (auditError) {
                console.log('[INFO] Could not fetch audit log for ban:', auditError.message);
            }
            
            // Create embed for logging
            const embed = {
                color: 0xFF0000, // Red
                title: '[MODERATION] Member Banned',
                description: `${user.tag} was banned from the server.`,
                fields: [
                    {
                        name: '[INFO] User',
                        value: `${user.tag} (${user.id})`,
                        inline: true
                    },
                    {
                        name: '[INFO] Banned By',
                        value: executor ? `${executor.tag}` : 'Unknown',
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    }
                ],
                thumbnail: {
                    url: user.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date().toISOString()
            };
            
            // Log the ban event
            await logEvent(guild, 'ban', embed);
            
            console.log(`[MODERATION] User ${user.tag} was banned from ${guild.name}`);
            
        } catch (error) {
            console.error('[ERROR] guildBanAdd event error:', error);
        }
    }
};
