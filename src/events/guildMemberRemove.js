// Guild Member Remove Event
// Logs when members leave the server

import { logEvent, createMemberLeaveEmbed } from '../utils/logger.js';
import { trackMemberChange } from '../utils/analyticsCollector.js';

export default {
    name: 'guildMemberRemove',
    once: false,
    
    async execute(member, client) {
        // Ignore bots leaving
        if (member.user.bot) return;
        
        // Track member leave for analytics
        trackMemberChange(member.guild.id, false, member.guild.memberCount);
        
        // Create and send the log embed
        const embed = createMemberLeaveEmbed(member);
        await logEvent(member.guild, 'memberLeave', embed);
    }
};
