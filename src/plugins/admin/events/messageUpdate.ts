import { logEvent, createMessageEditEmbed } from '../../../utils/guildLogging.js';

export default {
    name: 'messageUpdate',
    once: false,
    async execute(oldMessage: any, newMessage: any, _client: any) {
        if (!newMessage.guild) { return; }

        if (!newMessage.author) { return; }

        if (newMessage.author?.bot) { return; }

        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch {
                oldMessage = { content: '*Message content not cached*', ...oldMessage };
            }
        }

        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch {
                return;
            }
        }

        if (oldMessage.content === newMessage.content) { return; }

        if (!oldMessage.content && !newMessage.content) { return; }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const embed = createMessageEditEmbed(oldMessage, newMessage);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await logEvent(newMessage.guild, 'messageEdit', embed);
    }
};