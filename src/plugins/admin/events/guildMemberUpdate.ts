import { logEvent, createRoleChangeEmbed } from '../../../utils/guildLogging.js';

export default {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember: any, newMember: any, _client: any) {
        if (newMember.user.bot) { return; }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const embed = createRoleChangeEmbed(oldMember, newMember);

        if (embed) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            await logEvent(newMember.guild, 'roleChanges', embed);
        }
    }
};