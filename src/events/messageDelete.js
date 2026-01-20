// Message Delete Event
// Logs deleted messages to the server's log channel

import { logEvent, createMessageDeleteEmbed } from '../utils/logger.js';

export default {
    name: 'messageDelete',
    once: false,
    
    async execute(message, client) {
        // Ignore DMs
        if (!message.guild) return;
        
        // Ignore bot messages
        if (message.author?.bot) return;
        
        // Ignore partial messages without content we can log
        if (message.partial) {
            try {
                await message.fetch();
            } catch (error) {
                // Cannot fetch the message, skip logging
                return;
            }
        }
        
        // Create and send the log embed
        const embed = createMessageDeleteEmbed(message);
        await logEvent(message.guild, 'messageDelete', embed);
    }
};
