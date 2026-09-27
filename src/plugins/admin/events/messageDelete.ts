import { logEvent, createMessageDeleteEmbed } from '../../../utils/guildLogging.js';

export default {
    name: 'messageDelete',
    once: false,

    async execute(message: any, _client: any) {
        if (!message.guild) { return; }

        if (!message.author) { return; }

        if (message.author?.bot) { return; }

        if (message.partial) {
            try {
                await message.fetch();
            } catch {
                return;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const embed = createMessageDeleteEmbed(message);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await logEvent(message.guild, 'messageDelete', embed);
    }
};