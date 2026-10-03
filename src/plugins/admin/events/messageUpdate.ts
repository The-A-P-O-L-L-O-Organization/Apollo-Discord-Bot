import { logEvent, createMessageEditEmbed } from '../../../utils/guildLogging.js';
import type { Message } from 'discord.js';

export default {
    name: 'messageUpdate',
    once: false,
    async execute(oldMessage: Message, newMessage: Message, _client: unknown) {
        if (!newMessage.guild) { return; }

        if (!newMessage.author) { return; }

        if (newMessage.author?.bot) { return; }

        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch {
                const oldContent = oldMessage.content ?? '*Message content not cached*';
                const newContent = newMessage.content ?? '*Message content not cached*';
                if (oldContent === newContent) { return; }
                if (!oldContent && !newContent) { return; }

                const embed = createMessageEditEmbed(
                    { content: oldContent, author: oldMessage.author, channelId: oldMessage.channelId } as Message,
                    { content: newContent, author: newMessage.author, channelId: newMessage.channelId } as Message
                );
                await logEvent(newMessage.guild, 'messageEdit', embed);
                return;
            }
        }

        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch {
                return;
            }
        }

        const oldContent = oldMessage.content ?? '*Message content not cached*';
        const newContent = newMessage.content ?? '*Message content not cached*';

        if (oldContent === newContent) { return; }
        if (!oldContent && !newContent) { return; }

        const embed = createMessageEditEmbed(oldMessage, newMessage);
        await logEvent(newMessage.guild, 'messageEdit', embed);
    }
};