// @ts-expect-error - JS file not yet migrated
import { logEvent, createVoiceChangeEmbed } from '../../../utils/logger.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState: any, newState: any, _client: any) {
        const member = newState.member || oldState.member;

        if (member?.user?.bot) { return; }

        const embed = createVoiceChangeEmbed(oldState, newState);

        if (embed) {
            const guild = newState.guild || oldState.guild;
            await logEvent(guild, 'voiceChanges', embed);
        }
    }
};