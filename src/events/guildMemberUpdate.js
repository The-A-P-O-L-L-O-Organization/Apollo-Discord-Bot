// Guild Member Update Event
// Logs role changes for members

import { logEvent, createRoleChangeEmbed } from '../utils/logger.js';

export default {
    name: 'guildMemberUpdate',
    once: false,
    
    async execute(oldMember, newMember, client) {
        // Ignore bots
        if (newMember.user.bot) return;
        
        // Create the role change embed (returns null if no role changes)
        const embed = createRoleChangeEmbed(oldMember, newMember);
        
        // Only log if there were actual role changes
        if (embed) {
            await logEvent(newMember.guild, 'roleChanges', embed);
        }
    }
};
