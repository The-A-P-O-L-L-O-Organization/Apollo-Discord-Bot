// Voice State Update Event
// Logs voice channel join/leave/move events

import { logEvent, createVoiceChangeEmbed } from '../utils/logger.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    
    async execute(oldState, newState, client) {
        // Get the member from either state
        const member = newState.member || oldState.member;
        
        // Ignore bots
        if (member?.user?.bot) return;
        
        // Create the voice change embed (returns null for insignificant changes)
        const embed = createVoiceChangeEmbed(oldState, newState);
        
        // Only log if there was a significant voice state change
        if (embed) {
            const guild = newState.guild || oldState.guild;
            await logEvent(guild, 'voiceChanges', embed);
        }
    }
};
