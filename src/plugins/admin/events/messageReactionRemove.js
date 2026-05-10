import { getGuildData } from '../../../utils/db.js';

export default {
    name: 'messageReactionRemove',
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
        
        const reactionRoles = await getGuildData('reactionroles', guildId);
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
        
        if (!member.roles.cache.has(reactionRole.roleId)) {
            return;
        }
        
        try {
            await member.roles.remove(reactionRole.roleId, 'Reaction role removed');
            console.log(`[INFO] Removed role ${reactionRole.roleId} from ${user.tag} via reaction role`);
        } catch (error) {
            console.error(`[ERROR] Failed to remove role ${reactionRole.roleId} from ${user.tag}:`, error);
        }
    }
};
