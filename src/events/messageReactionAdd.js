// Message Reaction Add Event
// Handles giving roles when users react to reaction role messages

import { getGuildData } from '../utils/dataStore.js';
import { config } from '../config/config.js';

export default {
    name: 'messageReactionAdd',
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
        
        // Check if member already has the role
        if (member.roles.cache.has(reactionRole.roleId)) {
            return; // Already has the role
        }
        
        // Try to add the role
        try {
            await member.roles.add(reactionRole.roleId, 'Reaction role');
            console.log(`[INFO] Added role ${reactionRole.roleId} to ${user.tag} via reaction role`);
            
            // DM user if configured
            if (config.reactionRoles.dmOnRole) {
                try {
                    const role = await guild.roles.fetch(reactionRole.roleId);
                    await user.send({
                        content: `You have been given the **${role.name}** role in **${guild.name}**!`
                    });
                } catch (dmError) {
                    // User has DMs disabled, ignore
                }
            }
        } catch (error) {
            console.error(`[ERROR] Failed to add role ${reactionRole.roleId} to ${user.tag}:`, error);
        }
    }
};
