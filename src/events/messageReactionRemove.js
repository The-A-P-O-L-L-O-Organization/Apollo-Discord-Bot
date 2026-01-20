// Message Reaction Remove Event
// Handles removing roles when users remove their reaction from reaction role messages

import { getGuildData } from '../utils/dataStore.js';

export default {
    name: 'messageReactionRemove',
    once: false,
    
    async execute(reaction, user, client) {
        // Ignore bot reactions
        if (user.bot) return;
        
        // Handle partial reactions
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('[ERROR] Failed to fetch reaction:', error);
                return;
            }
        }
        
        // Ignore DMs
        if (!reaction.message.guild) return;
        
        const guild = reaction.message.guild;
        const guildId = guild.id;
        const messageId = reaction.message.id;
        
        // Get emoji identifier
        const emojiIdentifier = reaction.emoji.id 
            ? `${reaction.emoji.name}:${reaction.emoji.id}` 
            : reaction.emoji.name;
        
        // Check if this is a reaction role
        const reactionRoles = getGuildData('reactionroles', guildId);
        if (!reactionRoles.roles || reactionRoles.roles.length === 0) return;
        
        const reactionRole = reactionRoles.roles.find(
            rr => rr.messageId === messageId && 
                  (rr.emoji === emojiIdentifier || rr.emoji === reaction.emoji.name || rr.emoji === reaction.emoji.id)
        );
        
        if (!reactionRole) return;
        
        // Fetch the member
        let member;
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
            console.error(`[ERROR] Failed to fetch member ${user.id}:`, error);
            return;
        }
        
        // Check if member has the role
        if (!member.roles.cache.has(reactionRole.roleId)) {
            return; // Doesn't have the role
        }
        
        // Try to remove the role
        try {
            await member.roles.remove(reactionRole.roleId, 'Reaction role removed');
            console.log(`[INFO] Removed role ${reactionRole.roleId} from ${user.tag} via reaction role`);
        } catch (error) {
            console.error(`[ERROR] Failed to remove role ${reactionRole.roleId} from ${user.tag}:`, error);
        }
    }
};
