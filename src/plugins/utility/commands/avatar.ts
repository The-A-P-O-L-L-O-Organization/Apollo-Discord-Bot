import type { ChatInputCommandInteraction} from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const user = interaction.options.getUser('user') ?? interaction.user;
            const serverAvatar = interaction.options.getBoolean('server') ?? false;

            // Get member if checking server avatar
            let member = null;
            let avatarURL = null;
            let avatarType = t('avatar.global');

            if (serverAvatar && interaction.guild) {
                member = await interaction.guild.members.fetch(user.id);
                if (member?.avatar) {
                    avatarURL = member.avatarURL({ extension: 'png', size: 4096 });
                    avatarType = t('avatar.server');
                }
            }

            // Fall back to global avatar
            avatarURL ??= user.displayAvatarURL({ extension: 'png', size: 4096 });

            // Determine format
            const format = avatarURL.includes('.gif') ? 'GIF' : 'PNG';

            // Create avatar embed
            const avatarEmbed = {
                color: 0x3498DB,
                title: t('avatar.title', { prefix: avatarType, tag: user.tag }),
                description: `${avatarType} (${format})`,
                image: {
                    url: avatarURL
                },
                fields: [
                    {
                        name: t('avatar.userId'),
                        value: user.id,
                        inline: true
                    },
                    {
                        name: t('avatar.download'),
                        value: `[${t('avatar.clickHere')}](${avatarURL})`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [avatarEmbed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};