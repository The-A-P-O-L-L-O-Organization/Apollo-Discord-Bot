import { logEvent, createVoiceChangeEmbed } from '../../../utils/guildLogging.js';
import type { VoiceState } from 'discord.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState: VoiceState, newState: VoiceState, _client: unknown) {
        const member = newState.member ?? oldState.member;

        if (member?.user?.bot) { return; }

        const embed = await createVoiceChangeEmbed(oldState, newState);

        if (embed) {
            const guild = newState.guild ?? oldState.guild;
            if (guild) {
                await logEvent(guild, 'voiceChanges', embed);
            }
        }
    }
};