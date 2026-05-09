import { logEvent, createMessageEditEmbed } from '../../../utils/logger.js';

export default {
    name: 'messageUpdate',
    once: false,
    
    async execute(oldMessage, newMessage, client) {
        if (!newMessage.guild) {return;}

        if (!newMessage.author) {return;}
        
        if (newMessage.author?.bot) {return;}
        
        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch (error) {
                oldMessage = { content: '*Message content not cached*', ...oldMessage };
            }
        }
        
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (error) {
                return;
            }
        }
        
        if (oldMessage.content === newMessage.content) {return;}
        
        if (!oldMessage.content && !newMessage.content) {return;}
        
        const embed = createMessageEditEmbed(oldMessage, newMessage);
        await logEvent(newMessage.guild, 'messageEdit', embed);
    }
};
