import { logEvent, createMessageDeleteEmbed } from '../../../utils/guildLogging.js';
import type { Message } from 'discord.js';

export default {
    name: 'messageDelete',
    once: false,

    async execute(message: Message, _client: unknown) {
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


        const embed = await createMessageDeleteEmbed(message);

        await logEvent(message.guild, 'messageDelete', embed);
    }
};