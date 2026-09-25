import type { ChatInputCommandInteraction} from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Banner Command
    // Display a user's banner image (requires Nitro)
    name: 'banner',
    description: 'Display a user\'s banner image (requires Nitro)',
    category: 'utility',
    dmPermission: true,
    options: [
        {
            name: 'user',
            description: 'The user to get banner for',
            type: 6, // USER type
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

            // Fetch full user to get banner
            const fullUser = await interaction.client.users.fetch(user.id);

            // Check if user has a banner
            if (!fullUser.banner) {
                const noBannerEmbed = {
                    color: 0xFF0000,
                    title: t('banner.noBannerTitle'),
                    description: t('banner.noBanner', { tag: user.tag }),
                    fields: [
                        {
                            name: t('banner.user'),
                            value: user.tag,
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [noBannerEmbed] });
                return;
            }

            const bannerURL = fullUser.bannerURL({ extension: 'png', size: 4096 });
            if (!bannerURL) {
                const noBannerEmbed = {
                    color: 0xFF0000,
                    title: t('banner.noBannerTitle'),
                    description: t('banner.noBanner', { tag: user.tag }),
                    fields: [
                        {
                            name: t('banner.user'),
                            value: user.tag,
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [noBannerEmbed] });
                return;
            }

            const format = bannerURL.includes('.gif') ? 'GIF' : 'PNG';

            // Create banner embed
            const bannerEmbed = {
                color: 0x3498DB,
                title: t('banner.title', { tag: user.tag }),
                description: `(${format})`,
                image: {
                    url: bannerURL
                },
                fields: [
                    {
                        name: t('banner.userId'),
                        value: user.id,
                        inline: true
                    },
                    {
                        name: t('banner.download'),
                        value: `[${t('banner.clickHere')}](${bannerURL})`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [bannerEmbed] });
            return;
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