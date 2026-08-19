// Voice Mute Command
// Server mutes a user in a voice channel

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';

export default {
    name: 'voicemute',
    description: 'Server mute a user in a voice channel',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.MuteMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to mute',
            type: 6, // USER type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for muting',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to mute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const member = await fetchMember(interaction.guild, user.id);
            
            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] User Not In Server',
                    description: 'This user is not in the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Not In Voice Channel',
                    description: `${user.tag} is not currently in a voice channel.`,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (member.voice.serverMute) {
                const errorEmbed = {
                    color: 0xFFFF00,
                    title: '[INFO] Already Muted',
                    description: `${user.tag} is already server muted.`,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (!member.voice.channel.permissionsFor(interaction.guild.members.me).has('MuteMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing Permissions',
                    description: 'I do not have permission to mute members in that voice channel.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot mute yourself using this command.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot mute the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const hierarchy = canModerate(interaction.guild, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Hierarchy Check Failed',
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const channelName = member.voice.channel.name;
            
            // Mute the user
            await member.voice.setMute(true, reason);
            
            trackModAction(interaction.guild.id, interaction.user.id, 'voice_mute');
            await flushAnalyticsCritical();
            
            const caseId = createModCase(interaction.guild.id, {
                type: 'voice_mute',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Muted',
                description: `${user.tag} has been server muted in **${channelName}**.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Case ID', value: `#${caseId}`, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false },
                    { name: '[INFO] Channel', value: channelName, inline: true },
                    { name: '[INFO] User ID', value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            await sendModLog(interaction.guild, {
                action: 'voice_mute',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': channelName,
                    'Case ID': `#${caseId}`
                }
            });
            
            console.log(`[MODERATION] User ${user.tag} was voice muted by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mute the user.',
                fields: [
                    { name: '[ERROR] Details', value: safeError(error), inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};