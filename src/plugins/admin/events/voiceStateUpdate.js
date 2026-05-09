import { logEvent, createVoiceChangeEmbed } from '../../../utils/logger.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    
    async execute(oldState, newState, client) {
        const member = newState.member || oldState.member;
        
        if (member?.user?.bot) {return;}
        
        const embed = createVoiceChangeEmbed(oldState, newState);
        
        if (embed) {
            const guild = newState.guild || oldState.guild;
            await logEvent(guild, 'voiceChanges', embed);
        }
    }
};
