// Message Update Event
// Logs edited messages to the server's log channel

import { logEvent, createMessageEditEmbed } from '../utils/logger.js';

export default {
    name: 'messageUpdate',
    once: false,
    
    async execute(oldMessage, newMessage, client) {
        // Ignore DMs
        if (!newMessage.guild) return;
        
        // Ignore bot messages
        if (newMessage.author?.bot) return;
        
        // Handle partial messages
        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch (error) {
                // Cannot fetch old message - use placeholder
                oldMessage = { content: '*Message content not cached*', ...oldMessage };
            }
        }
        
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (error) {
                return; // Cannot log without new message content
            }
        }
        
        // Ignore if content hasn't changed (could be embed update, pin, etc.)
        if (oldMessage.content === newMessage.content) return;
        
        // Ignore empty content (likely an embed-only message)
        if (!oldMessage.content && !newMessage.content) return;
        
        // Create and send the log embed
        const embed = createMessageEditEmbed(oldMessage, newMessage);
        await logEvent(newMessage.guild, 'messageEdit', embed);
    }
};
