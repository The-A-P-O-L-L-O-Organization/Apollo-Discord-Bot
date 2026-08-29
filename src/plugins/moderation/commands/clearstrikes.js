// Clear Strikes Command
export default {
// Remove strikes from a user
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getUserData, setUserData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

    name: 'clearstrikes',
    description: 'Remove strikes from a user',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to clear strikes from',
            type: 6, // USER type
            required: true
        },
        {
            name: 'strike_id',
            description: 'Specific strike ID to remove (leave empty to remove all)',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
    try {

        try {
            const user = interaction.options.getUser('user');
            const strikeId = interaction.options.getString('strike_id');
            
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
            
            // Get user's strikes
            const strikes = await getUserData('strikes', interaction.guild.id, user.id) || [];
            
            if (strikes.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] No Strikes',
                        description: `${user.tag} has no strikes to clear.`,
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            let removed = 0;
            let description = '';
            
            if (strikeId) {
                // Remove specific strike
                const strikeIndex = strikes.findIndex(s => s.id === strikeId);
                
                if (strikeIndex === -1) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Strike Not Found',
                            description: `Strike with ID ${strikeId} not found.`,
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                strikes[strikeIndex].active = false;
                removed = 1;
                description = `Strike ${strikeId} has been removed.`;
                
                // Update strikes
                await setUserData('strikes', interaction.guild.id, user.id, strikes);
                
            } else {
                // Clear all strikes
                const activeCount = strikes.filter(s => s.active !== false).length;
                
                // Mark all as inactive
                strikes.forEach(s => s.active = false);
                removed = activeCount;
                description = `All ${removed} strike(s) have been removed.`;
                
                // Update strikes
                await setUserData('strikes', interaction.guild.id, user.id, strikes);
            }
            
            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('[SUCCESS] Strikes Cleared')
                .setDescription(description)
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Strikes Removed', value: `${removed}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'clearstrikes',
                target: user,
                moderator: interaction.user,
                reason: strikeId ? `Strike ${strikeId} removed` : 'All strikes removed',
                extra: {
                    'Strikes Removed': `${removed}`
                }
            });
            
            logger.info(`[MODERATION] ${removed} strike(s) cleared for ${user.tag} by ${interaction.user.tag}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while clearing strikes.',
                fields: [{ name: 'Error', value: safeError(error), inline: true }],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}
