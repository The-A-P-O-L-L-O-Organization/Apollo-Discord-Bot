// Strikes Command
import { logger } from '../../../utils/logger.js';
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'strikes',
    description: 'View a user\'s strike history',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to check strikes for',
            type: 6,
            required: true
        }
    ],
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            
            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const strikes = await getUserData('strikes', interaction.guild.id, user.id) || [];
            const activeStrikes = strikes.filter(s => s.active !== false);
            
            if (strikes.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: '[INFO] No Strikes',
                        description: `${user.tag} has no strikes on record.`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`Strike History - ${user.tag}`)
                .setDescription(`Total: ${strikes.length} strike(s) | Active: ${activeStrikes.length}`)
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();
            
            strikes.slice(0, 25).forEach((strike, index) => {
                const date = new Date(strike.timestamp).toLocaleString();
                const status = strike.active === false ? '(Removed)' : '';
                
                embed.addFields({
                    name: `Strike #${index + 1} ${status}`,
                    value: `**ID:** ${strike.id}\n**Reason:** ${strike.reason}\n**Moderator:** ${strike.moderatorTag}\n**Date:** ${date}`,
                    inline: false
                });
            });
            
            if (strikes.length > 25) {
                embed.setFooter({ text: `Showing 25 of ${strikes.length} strikes` });
            }
            
            await interaction.reply({ embeds: [embed] });
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