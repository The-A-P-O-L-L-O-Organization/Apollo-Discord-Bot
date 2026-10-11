import { logEvent, createRoleChangeEmbed } from '../../../utils/guildLogging.js';
import { isDuplicateEvent } from '../../../utils/eventDedupe.js';
import type { GuildMember } from 'discord.js';

export default {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember: GuildMember, newMember: GuildMember, _client: unknown) {
        if (newMember.user.bot) { return; }

        const oldRoles = [...oldMember.roles.cache.keys()].toSorted().join(',');
        const newRoles = [...newMember.roles.cache.keys()].toSorted().join(',');
        const eventId = `${newMember.guild.id}:${newMember.id}:${oldMember.nickname ?? ''}:${newMember.nickname ?? ''}:${oldRoles}:${newRoles}`;
        if (await isDuplicateEvent('guildMemberUpdate', eventId)) { return; }


        const embed = await createRoleChangeEmbed(oldMember, newMember);

        if (embed) {

            await logEvent(newMember.guild, 'roleChanges', embed);
        }
    }
};
