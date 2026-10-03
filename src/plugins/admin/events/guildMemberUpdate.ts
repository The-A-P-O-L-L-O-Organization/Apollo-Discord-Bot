import { logEvent, createRoleChangeEmbed } from '../../../utils/guildLogging.js';
import type { GuildMember } from 'discord.js';

export default {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember: GuildMember, newMember: GuildMember, _client: unknown) {
        if (newMember.user.bot) { return; }


        const embed = createRoleChangeEmbed(oldMember, newMember);

        if (embed) {

            await logEvent(newMember.guild, 'roleChanges', embed);
        }
    }
};