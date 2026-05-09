import { logEvent } from '../../../utils/logger.js';

export default {
    name: 'messageDeleteBulk',
    once: false,
    async execute(messages, channel, client) {
        try {
            if (!channel.guild) {return;}
            
            const guild = channel.guild;
            const messageCount = messages.size;
            
            let executor = null;
            let reason = 'Unknown';
            
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 73,
                    limit: 1
                });
                
                const bulkDeleteLog = auditLogs.entries.first();
                if (bulkDeleteLog && Date.now() - bulkDeleteLog.createdTimestamp < 5000) {
                    executor = bulkDeleteLog.executor;
                    reason = bulkDeleteLog.reason || 'No reason provided';
                }
            } catch (auditError) {
                console.log('[INFO] Could not fetch audit log for bulk delete:', auditError.message);
            }
            
            const oldestMessage = messages.reduce((oldest, msg) => 
                !oldest || msg.createdTimestamp < oldest.createdTimestamp ? msg : oldest
            , null);
            
            const newestMessage = messages.reduce((newest, msg) => 
                !newest || msg.createdTimestamp > newest.createdTimestamp ? msg : newest
            , null);
            
            const embed = {
                color: 0xFFA500,
                title: '[MODERATION] Bulk Message Deletion',
                description: `${messageCount} messages were deleted in ${channel}.`,
                fields: [
                    {
                        name: '[INFO] Channel',
                        value: `${channel.name} (${channel.id})`,
                        inline: true
                    },
                    {
                        name: '[INFO] Count',
                        value: `${messageCount} messages`,
                        inline: true
                    },
                    {
                        name: '[INFO] Deleted By',
                        value: executor ? `${executor.tag}` : 'Unknown',
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (oldestMessage && newestMessage) {
                const timeRange = `<t:${Math.floor(oldestMessage.createdTimestamp / 1000)}:f> - <t:${Math.floor(newestMessage.createdTimestamp / 1000)}:f>`;
                embed.fields.push({
                    name: '[INFO] Time Range',
                    value: timeRange,
                    inline: false
                });
            }
            
            await logEvent(guild, 'messageDeleteBulk', embed);
            
            console.log(`[MODERATION] ${messageCount} messages bulk deleted in #${channel.name} (${guild.name})`);
            
        } catch (error) {
            console.error('[ERROR] messageDeleteBulk event error:', error);
        }
    }
};
