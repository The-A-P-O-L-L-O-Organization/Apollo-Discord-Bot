import { logEvent, createMessageDeleteEmbed } from '../../../utils/logger.js';

export default {
    name: 'messageDelete',
    once: false,
    
    async execute(message, client) {
        if (!message.guild) {return;}

        if (!message.author) {return;}
        
        if (message.author?.bot) {return;}
        
        if (message.partial) {
            try {
                await message.fetch();
            } catch (error) {
                return;
            }
        }
        
        const embed = createMessageDeleteEmbed(message);
        await logEvent(message.guild, 'messageDelete', embed);
    }
};
