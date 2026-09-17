import type { GuildMember } from 'discord.js';
import { logEvent, createMemberLeaveEmbed } from '../../../utils/guildLogging.js';
import { trackMemberChange } from '../../../utils/analyticsCollector.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';

export default {
    name: 'guildMemberRemove',
    once: false,

    async execute(member: GuildMember, _client: unknown) {
        if (member.user.bot) { return; }

        trackMemberChange(member.guild.id, false, member.guild.memberCount);

        const rolePersistenceConfig = await getGuildData('role-persistence', member.guild.id);

        if (rolePersistenceConfig?.['enabled']) {
            const roleIds = member.roles.cache
                .filter((role) => role.name !== '@everyone')
                .map((role) => role.id);

            if (roleIds.length > 0) {
                await updateGuildData('role-persistence', member.guild.id, (data: Record<string, unknown>) => {
                    const saved = (data['savedRoles'] ?? {}) as Record<string, unknown>;
                    saved[member.id] = {
                        roles: roleIds,
                        username: member.user.tag,
                        savedAt: Date.now()
                    };
                    data['savedRoles'] = saved;
                    return data;
                });
                console.log(`[INFO] Saved ${roleIds.length} roles for ${member.user.tag}`);
            }
        }

        const embed = createMemberLeaveEmbed(member);
        await logEvent(member.guild, 'memberLeave', embed);
    }
};