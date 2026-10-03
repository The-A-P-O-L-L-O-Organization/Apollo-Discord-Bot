import { logEvent } from '../../../utils/guildLogging.js';
import type { GuildBan } from 'discord.js';

export default {
    name: 'guildBanRemove',
    once: false,
    async execute(ban: GuildBan, _client: unknown) {
        try {
            const guild = ban.guild;
            const user = ban.user;

            if (!guild || !user) {
                return;
            }

            let executor = null;

            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 23,
                    limit: 1
                });

                const unbanLog = auditLogs.entries.first();
                if (unbanLog?.target?.id === user.id) {
                    executor = unbanLog.executor;
                }
            } catch {
                // Ignore audit log errors
            }

            const embed = {
                color: 0x00FF00,
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
                    url: user.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };


            await logEvent(guild, 'unban', embed);

        } catch (error) {
            console.error('[ERROR] guildBanRemove event error:', error);
        }
    }
};