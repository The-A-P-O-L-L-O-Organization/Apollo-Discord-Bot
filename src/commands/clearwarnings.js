// Clear Warnings Command
// Clears warnings for a user (single or all)

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { 
    getUserData, 
    setUserData,
    removeFromUserArray 
} from '../utils/dataStore.js';
import { sendModLog } from '../utils/modLog.js';

export default {
    name: 'clearwarnings',
    description: 'Clear warnings for a user',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to clear warnings for',
            type: 6, // USER type
            required: true
        },
        {
            name: 'warning-id',
            description: 'Specific warning ID to clear (leave empty to clear all)',
            type: 3, // STRING type
            required: false
        },
        {
            name: 'reason',
            description: 'Reason for clearing the warning(s)',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const warningId = interaction.options.getString('warning-id');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user exists
            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            // Get current warnings
            const warnings = getUserData('warnings', interaction.guild.id, user.id) || [];
            
            if (warnings.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFFFF00,
                        title: '[INFO] No Warnings',
                        description: `${user.tag} has no warnings to clear.`,
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            let clearedCount = 0;
            let clearedWarning = null;
            
            if (warningId) {
                // Clear specific warning by ID
                const warningIndex = warnings.findIndex(w => w.id === warningId);
                
                if (warningIndex === -1) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Warning Not Found',
                            description: `Could not find warning with ID \`${warningId}\` for ${user.tag}.`,
                            fields: [{
                                name: 'Tip',
                                value: `Use \`/warnings user:${user.tag}\` to see all warning IDs.`
                            }],
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                }
                
                // Mark warning as inactive instead of deleting (for history)
                clearedWarning = warnings[warningIndex];
                warnings[warningIndex] = {
                    ...clearedWarning,
                    active: false,
                    clearedBy: interaction.user.id,
                    clearedByTag: interaction.user.tag,
                    clearedAt: Date.now(),
                    clearReason: reason
                };
                
                setUserData('warnings', interaction.guild.id, user.id, warnings);
                clearedCount = 1;
                
            } else {
                // Clear all active warnings
                const activeWarnings = warnings.filter(w => w.active !== false);
                
                if (activeWarnings.length === 0) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFFFF00,
                            title: '[INFO] No Active Warnings',
                            description: `${user.tag} has no active warnings to clear.`,
                            timestamp: new Date().toISOString()
                        }],
                        ephemeral: true
                    });
                }
                
                // Mark all as inactive
                const updatedWarnings = warnings.map(w => {
                    if (w.active !== false) {
                        return {
                            ...w,
                            active: false,
                            clearedBy: interaction.user.id,
                            clearedByTag: interaction.user.tag,
                            clearedAt: Date.now(),
                            clearReason: reason
                        };
                    }
                    return w;
                });
                
                setUserData('warnings', interaction.guild.id, user.id, updatedWarnings);
                clearedCount = activeWarnings.length;
            }
            
            // Create success embed
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('[SUCCESS] Warnings Cleared')
                .setDescription(
                    warningId 
                        ? `Cleared warning \`${warningId}\` for ${user.tag}.`
                        : `Cleared all ${clearedCount} active warning(s) for ${user.tag}.`
                )
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Cleared By', value: interaction.user.tag, inline: true },
                    { name: 'Warnings Cleared', value: `${clearedCount}`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setTimestamp();
            
            // Add specific warning details if clearing single warning
            if (clearedWarning) {
                embed.addFields({
                    name: 'Cleared Warning Details',
                    value: [
                        `**Original Reason:** ${clearedWarning.reason}`,
                        `**Issued By:** ${clearedWarning.moderatorTag || 'Unknown'}`,
                        `**Issued:** <t:${Math.floor(clearedWarning.timestamp / 1000)}:R>`
                    ].join('\n'),
                    inline: false
                });
            }
            
            // Show remaining active warnings
            const remainingActive = (getUserData('warnings', interaction.guild.id, user.id) || [])
                .filter(w => w.active !== false).length;
            
            embed.addFields({
                name: 'Remaining Active Warnings',
                value: `${remainingActive}`,
                inline: true
            });
            
            await interaction.reply({ embeds: [embed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'clearwarnings',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Warnings Cleared': `${clearedCount}`,
                    'Warning ID': warningId || 'All active',
                    'Remaining': `${remainingActive}`
                }
            });
            
            console.log(`[MODERATION] ${clearedCount} warning(s) cleared for ${user.tag} by ${interaction.user.tag}`);
            
        } catch (error) {
            console.error('[ERROR] Clear warnings command error:', error);
            
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred while clearing warnings.',
                    fields: [{ name: 'Error', value: error.message, inline: true }],
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }
    }
};
