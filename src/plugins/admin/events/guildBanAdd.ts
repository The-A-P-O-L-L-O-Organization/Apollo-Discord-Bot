import { logEvent } from '../../../utils/guildLogging.js';
import type { GuildBan } from 'discord.js';

export default {
    name: 'guildBanAdd',
    once: false,
    async execute(ban: GuildBan, _client: unknown) {
        try {
            const guild = ban.guild;
            const user = ban.user;

            if (!guild || !user) {
                return;
            }

            let executor = null;
            let reason = ban.reason ?? 'No reason provided';

            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 22,
                    limit: 1
                });

                const banLog = auditLogs.entries.first();
                if (banLog?.target?.id === user.id) {
                    executor = banLog.executor;
                    reason = banLog.reason ?? reason;
                }
            } catch {
                // Ignore audit log errors
            }

            const embed = {
                color: 0xFF0000,
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
                    url: user.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };


            await logEvent(guild, 'ban', embed);

        } catch (error) {
            console.error('[ERROR] guildBanAdd event error:', error);
        }
    }
};