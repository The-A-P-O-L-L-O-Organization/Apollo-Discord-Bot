import { ChatInputCommandInteraction, User } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    // Avatar Command
    // Display a user's avatar
    name: 'avatar',
    description: 'Display a user\'s avatar',
    category: 'utility',
    dmPermission: true,
    options: [
        {
            name: 'user',
            description: 'The user to get avatar for',
            type: 6, // USER type
            required: false
        },
        {
            name: 'server',
            description: 'Show server-specific avatar instead of global',
            type: 5, // BOOLEAN
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const user = interaction.options.getUser('user') || interaction.user;
            const serverAvatar = interaction.options.getBoolean('server') ?? false;

            // Get member if checking server avatar
            let member = null;
            let avatarURL = null;
            let avatarType = 'Global Avatar';

if (serverAvatar && interaction.guild) {
                member = await interaction.guild.members.fetch(user.id);
                if (member && member.avatar) {
                    avatarURL = member.avatarURL({ extension: 'png', size: 4096 });
                    avatarType = 'Server Avatar';
                }
            }
            
            // Fall back to global avatar
            if (!avatarURL) {
                avatarURL = user.displayAvatarURL({ extension: 'png', size: 4096 });
            }

            // Determine format
            const format = avatarURL.includes('.gif') ? 'GIF' : 'PNG';

            // Create avatar embed
            const avatarEmbed = {
                color: 0x3498DB,
                title: `[AVATAR] ${user.tag}`,
                description: `${avatarType} (${format})`,
                image: {
                    url: avatarURL
                },
                fields: [
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    },
                    {
                        name: '[LINK] Download',
                        value: `[Click here](${avatarURL})`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [avatarEmbed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};