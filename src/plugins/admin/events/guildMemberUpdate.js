import { logEvent, createRoleChangeEmbed } from '../../../utils/logger.js';

export default {
    name: 'guildMemberUpdate',
    once: false,
    
    async execute(oldMember, newMember, client) {
        if (newMember.user.bot) {return;}
        
        const embed = createRoleChangeEmbed(oldMember, newMember);
        
        if (embed) {
            await logEvent(newMember.guild, 'roleChanges', embed);
        }
    }
};
