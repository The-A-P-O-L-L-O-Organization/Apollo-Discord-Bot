import { logEvent, createMemberLeaveEmbed } from '../../../utils/logger.js';
import { trackMemberChange } from '../../../utils/analyticsCollector.js';
import { getGuildData, setGuildData, updateGuildData } from '../../../utils/db.js';

export default {
    name: 'guildMemberRemove',
    once: false,

    async execute(member, client) {
        if (member.user.bot) {return;}

        trackMemberChange(member.guild.id, false, member.guild.memberCount);

        const rolePersistenceConfig = await getGuildData('role-persistence', member.guild.id);

        if (rolePersistenceConfig && rolePersistenceConfig.enabled) {
            const roleIds = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => role.id);

            if (roleIds.length > 0) {
                await updateGuildData('role-persistence', member.guild.id, (data) => {
                    if (!data.savedRoles) {data.savedRoles = {};}
                    data.savedRoles[member.id] = {
                        roles: roleIds,
                        username: member.user.tag,
                        savedAt: Date.now()
                    };
                    return data;
                });
                console.log(`[INFO] Saved ${roleIds.length} roles for ${member.user.tag}`);
            }
        }

        const embed = createMemberLeaveEmbed(member);
        await logEvent(member.guild, 'memberLeave', embed);
    }
};
