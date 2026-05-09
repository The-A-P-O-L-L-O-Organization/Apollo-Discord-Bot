import { getGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';

export default {
    name: 'messageReactionAdd',
    once: false,
    
    async execute(reaction, user, client) {
        if (user.bot) {return;}
        
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('[ERROR] Failed to fetch reaction:', error);
                return;
            }
        }
        
        if (!reaction.message.guild) {return;}
        
        const guild = reaction.message.guild;
        const guildId = guild.id;
        const messageId = reaction.message.id;
        
        const emojiIdentifier = reaction.emoji.id 
            ? `${reaction.emoji.name}:${reaction.emoji.id}` 
            : reaction.emoji.name;
        
        const reactionRoles = getGuildData('reactionroles', guildId);
        if (!reactionRoles.roles || reactionRoles.roles.length === 0) {return;}
        
        const reactionRole = reactionRoles.roles.find(
            rr => rr.messageId === messageId && 
                  (rr.emoji === emojiIdentifier || rr.emoji === reaction.emoji.name || rr.emoji === reaction.emoji.id)
        );
        
        if (!reactionRole) {return;}
        
        let member;
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
            console.error(`[ERROR] Failed to fetch member ${user.id}:`, error);
            return;
        }
        
        if (member.roles.cache.has(reactionRole.roleId)) {
            return;
        }
        
        try {
            await member.roles.add(reactionRole.roleId, 'Reaction role');
            console.log(`[INFO] Added role ${reactionRole.roleId} to ${user.tag} via reaction role`);
            
            if (config.reactionRoles.dmOnRole) {
                try {
                    const role = await guild.roles.fetch(reactionRole.roleId);
                    await user.send({
                        content: `You have been given the **${role.name}** role in **${guild.name}**!`
                    });
                } catch (dmError) {
                }
            }
        } catch (error) {
            console.error(`[ERROR] Failed to add role ${reactionRole.roleId} to ${user.tag}:`, error);
        }
    }
};
