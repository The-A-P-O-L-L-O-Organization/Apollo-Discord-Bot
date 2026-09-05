import { ChatInputCommandInteraction, User } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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
            const user = interaction.options.getUser('user') || interaction.user;

            // Fetch full user to get banner
            const fullUser = await interaction.client.users.fetch(user.id);

            // Check if user has a banner
if (!fullUser.banner) {
                const noBannerEmbed = {
                    color: 0xFF0000,
                    title: '[INFO] No Banner',
                    description: `${user.tag} does not have a banner image.\n(Banners require Discord Nitro)`,
                    fields: [
                        {
                            name: '[INFO] User',
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
                    title: '[INFO] No Banner',
                    description: `${user.tag} does not have a banner image.\n(Banners require Discord Nitro)`,
                    fields: [
                        {
                            name: '[INFO] User',
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
                title: `[BANNER] ${user.tag}`,
                description: `(${format})`,
                image: {
                    url: bannerURL
                },
                fields: [
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    },
                    {
                        name: '[LINK] Download',
                        value: `[Click here](${bannerURL})`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [bannerEmbed] });
            return;
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