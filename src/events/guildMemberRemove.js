// Guild Member Remove Event
// Logs when members leave the server

import { logEvent, createMemberLeaveEmbed } from '../utils/logger.js';

export default {
    name: 'guildMemberRemove',
    once: false,
    
    async execute(member, client) {
        // Ignore bots leaving
        if (member.user.bot) return;
        
        // Create and send the log embed
        const embed = createMemberLeaveEmbed(member);
        await logEvent(member.guild, 'memberLeave', embed);
    }
};
