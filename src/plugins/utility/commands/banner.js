import { logger } from '../../../utils/logger.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    // Banner Command
    // Display a user's banner image (requires Nitro)
    name: 'banner',
    description: 'Display a user\'s banner image (requires Nitro)',
    category: 'Utility',
    dmPermission: true,
    options: [
        {
            name: 'user',
            description: 'The user to get banner for',
            type: 6, // USER type
            required: false
        }
    ],
    
    async execute(interaction) {
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
                
                return interaction.reply({ embeds: [noBannerEmbed] });
            }
            
            const bannerURL = fullUser.bannerURL({ dynamic: true, size: 4096 });
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