// Warn Command
// Issues a warning to a user with auto-punishment thresholds

import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { 
    getUserData, 
    appendToUserArray, 
    generateId,
    getGuildData,
    setGuildData 
} from '../utils/dataStore.js';
import { sendModLog, fetchMember } from '../utils/modLog.js';
import { config } from '../config/config.js';

export default {
    name: 'warn',
    description: 'Issue a warning to a user',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to warn',
            type: 6, // USER type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the warning',
            type: 3, // STRING type
            required: true
        }
    ],
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            
            // Check if user exists
            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user to warn.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            // Can't warn bots
            if (user.bot) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Target',
                        description: 'You cannot warn bots.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            // Can't warn yourself
            if (user.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Self Action',
                        description: 'You cannot warn yourself.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            // Get the member
            const member = await fetchMember(interaction.guild, user.id);
            
            if (!member) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Member Not Found',
                        description: 'This user is not a member of the server.',
                        timestamp: new Date().toISOString()
                    }],
                    ephemeral: true
                });
            }
            
            // Create warning object
            const warning = {
                id: generateId(),
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                timestamp: Date.now(),
                active: true
            };
            
            // Add warning to storage
            appendToUserArray('warnings', interaction.guild.id, user.id, warning);
            
            // Get total warnings count
            const userWarnings = getUserData('warnings', interaction.guild.id, user.id) || [];
            const activeWarnings = userWarnings.filter(w => w.active !== false);
            const warningCount = activeWarnings.length;
            
            // Get guild-specific thresholds or use defaults
            const guildSettings = getGuildData('warnings-config', interaction.guild.id);
            const thresholds = guildSettings.thresholds || config.warnings.thresholds;
            const muteDuration = guildSettings.muteDuration || config.warnings.muteDuration;
            
            // Try to DM the user
            let dmSent = false;
            if (config.warnings.dmOnWarn) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle(`⚠️ Warning in ${interaction.guild.name}`)
                        .setDescription(`You have been warned by a moderator.`)
                        .addFields(
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Total Warnings', value: `${warningCount}`, inline: true },
                            { name: 'Warning ID', value: warning.id, inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Please follow the server rules to avoid further action.' });
                    
                    await user.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch (dmError) {
                    console.log(`[INFO] Could not DM user ${user.tag} about warning`);
                }
            }
            
            // Check for auto-punishment thresholds
            let autoPunishment = null;
            
            if (thresholds.ban && warningCount >= thresholds.ban) {
                // Auto-ban
                try {
                    await interaction.guild.bans.create(user.id, {
                        reason: `Auto-ban: Reached ${warningCount} warnings. Latest: ${reason}`
                    });
                    autoPunishment = 'banned';
                } catch (banError) {
                    console.error('[ERROR] Auto-ban failed:', banError);
                }
            } else if (thresholds.kick && warningCount >= thresholds.kick) {
                // Auto-kick
                try {
                    if (member.kickable) {
                        await member.kick(`Auto-kick: Reached ${warningCount} warnings. Latest: ${reason}`);
                        autoPunishment = 'kicked';
                    }
                } catch (kickError) {
                    console.error('[ERROR] Auto-kick failed:', kickError);
                }
            } else if (thresholds.mute && warningCount >= thresholds.mute) {
                // Auto-mute
                try {
                    if (member.moderatable) {
                        await member.timeout(muteDuration, `Auto-mute: Reached ${warningCount} warnings. Latest: ${reason}`);
                        autoPunishment = 'muted';
                    }
                } catch (muteError) {
                    console.error('[ERROR] Auto-mute failed:', muteError);
                }
            }
            
            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('[SUCCESS] User Warned')
                .setDescription(`${user.tag} has been warned.`)
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: `${warningCount}`, inline: true },
                    { name: 'Warning ID', value: warning.id, inline: true },
                    { name: 'DM Sent', value: dmSent ? 'Yes' : 'No', inline: true }
                )
                .setTimestamp();
            
            // Add auto-punishment info if applicable
            if (autoPunishment) {
                successEmbed.addFields({
                    name: '⚠️ Auto-Punishment Applied',
                    value: `User has been **${autoPunishment}** for reaching ${warningCount} warnings.`,
                    inline: false
                });
            }
            
            // Add threshold warning
            if (!autoPunishment) {
                const nextThreshold = getNextThreshold(warningCount, thresholds);
                if (nextThreshold) {
                    successEmbed.addFields({
                        name: 'Next Threshold',
                        value: `${nextThreshold.action} at ${nextThreshold.count} warnings (${nextThreshold.count - warningCount} more)`,
                        inline: false
                    });
                }
            }
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'warn',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Warning Count': `${warningCount}`,
                    'Warning ID': warning.id,
                    'Auto-Punishment': autoPunishment || 'None'
                }
            });
            
            console.log(`[MODERATION] User ${user.tag} warned by ${interaction.user.tag}. Total: ${warningCount}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Warn command error:', error);
            
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: 'An error occurred while trying to warn the user.',
                    fields: [{ name: 'Error', value: error.message, inline: true }],
                    timestamp: new Date().toISOString()
                }],
                ephemeral: true
            });
        }
    }
};

/**
 * Gets the next punishment threshold
 * @param {number} currentCount - Current warning count
 * @param {Object} thresholds - Threshold configuration
 * @returns {Object|null} Next threshold info or null
 */
function getNextThreshold(currentCount, thresholds) {
    const sorted = [
        { action: 'mute', count: thresholds.mute },
        { action: 'kick', count: thresholds.kick },
        { action: 'ban', count: thresholds.ban }
    ].filter(t => t.count).sort((a, b) => a.count - b.count);
    
    return sorted.find(t => t.count > currentCount) || null;
}
