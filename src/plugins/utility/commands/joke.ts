import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    // Joke Command
    // Get a random joke
    name: 'joke',
    description: 'Get a random joke',
    category: 'Fun',
    dmPermission: true,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const jokes = [
                { setup: 'Why don\'t scientists trust atoms?', punchline: 'Because they make up everything!' },
                { setup: 'Why did the scarecrow win an award?', punchline: 'He was outstanding in his field!' },
                { setup: 'What do you call a fake noodle?', punchline: 'An impasta!' },
                { setup: 'Why don\'t eggs tell jokes?', punchline: 'They\'d crack each other up!' },
                { setup: 'What do you call a bear with no teeth?', punchline: 'A gummy bear!' },
                { setup: 'Why did the bicycle fall over?', punchline: 'Because it was two tired!' },
                { setup: 'What do you call a dog that does magic?', punchline: 'A Labracadabrador!' },
                { setup: 'Why did the math book look so sad?', punchline: 'Because it had too many problems!' },
                { setup: 'What do you call a fish without eyes?', punchline: 'A fsh!' },
                { setup: 'Why don\'t skeletons fight each other?', punchline: 'They don\'t have the guts!' },
                { setup: 'What do you call cheese that isn\'t yours?', punchline: 'Nacho cheese!' },
                { setup: 'Why did the cookie go to the doctor?', punchline: 'Because it was feeling crummy!' },
                { setup: 'What do you call a lazy kangaroo?', punchline: 'A pouch potato!' },
                { setup: 'Why was the computer cold?', punchline: 'It left its Windows open!' },
                { setup: 'What do you call a talking dog?', punchline: 'A bark-bark!' }
            ];

            const randomIndex = Math.floor(Math.random() * jokes.length);
            const joke = jokes[randomIndex];
            if (!joke) { return; }

            const jokeEmbed = {
                color: 0x3498DB,
                title: '[JOKE] Random Joke',
                description: `**${joke.setup}**\n\n${joke.punchline}`,
                fields: [
                    {
                        name: '[INFO] Requested by',
                        value: interaction.user.tag,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [jokeEmbed] });

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Joke command error' });

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error instanceof Error ? error.message : 'Unknown error',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};