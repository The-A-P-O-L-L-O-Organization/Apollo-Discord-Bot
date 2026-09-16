// @ts-expect-error - JS file not yet migrated
import { logEvent } from '../../../utils/logger.js';

export default {
    name: 'messageDeleteBulk',
    once: false,
    async execute(messages: any, channel: any, client: any) {
        try {
            if (!channel.guild) { return; }

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
            } catch {
                // Ignore audit log errors
            }

            const oldestMessage = messages.reduce((oldest: any, msg: any) =>
                !oldest || msg.createdTimestamp < oldest.createdTimestamp ? msg : oldest
            , null);

            const newestMessage = messages.reduce((newest: any, msg: any) =>
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

        } catch (error) {
            console.error('[ERROR] messageDeleteBulk event error:', error);
        }
    }
};