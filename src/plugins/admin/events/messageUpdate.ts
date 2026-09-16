// @ts-expect-error - JS file not yet migrated
import { logEvent, createMessageEditEmbed } from '../../../utils/logger.js';

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

        const embed = createMessageEditEmbed(oldMessage, newMessage);
        await logEvent(newMessage.guild, 'messageEdit', embed);
    }
};