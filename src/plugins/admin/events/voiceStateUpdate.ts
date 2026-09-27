import { logEvent, createVoiceChangeEmbed } from '../../../utils/guildLogging.js';

export default {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState: any, newState: any, _client: any) {
        const member = newState.member ?? oldState.member;

        if (member?.user?.bot) { return; }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const embed = createVoiceChangeEmbed(oldState, newState);

        if (embed) {
            const guild = newState.guild ?? oldState.guild;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            await logEvent(guild, 'voiceChanges', embed);
        }
    }
};