import { logEvent, createVoiceChangeEmbed } from '../../../utils/guildLogging.js';
import { isDuplicateEvent } from '../../../utils/eventDedupe.js';
import type { VoiceState } from 'discord.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState: VoiceState, newState: VoiceState, _client: unknown) {
        const member = newState.member ?? oldState.member;

        if (member?.user?.bot) { return; }

        const guild = newState.guild ?? oldState.guild;
        const voiceEventId = `${guild?.id ?? 'unknown'}:${member?.id ?? 'unknown'}:${oldState.channelId ?? 'none'}:${newState.channelId ?? 'none'}:${oldState.mute ?? false}:${newState.mute ?? false}:${oldState.deaf ?? false}:${newState.deaf ?? false}`;
        if (await isDuplicateEvent('voiceStateUpdate', voiceEventId)) { return; }

        const embed = await createVoiceChangeEmbed(oldState, newState);

        if (embed && guild) {
            await logEvent(guild, 'voiceChanges', embed);
        }
    }
};