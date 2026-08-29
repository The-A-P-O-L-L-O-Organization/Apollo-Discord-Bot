// Unlock Command
import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'unlock',
    description: 'Unlock a previously locked channel',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        { name: 'channel', description: 'The channel to unlock (defaults to current channel)', type: 7, required: false },
        { name: 'reason', description: 'The reason for unlocking', type: 3, required: false }
    ],
    
    async execute(interaction) {
        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!channel.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Channel',
                    description: 'You can only unlock text-based channels.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            const lockdownData = await getGuildData('channel-lockdowns', interaction.guild.id);
            const lockInfo = lockdownData[channel.id];
            
            if (!lockInfo) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Channel Not Locked',
                    description: `${channel} is not currently in lockdown mode.`,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            const everyoneRole = interaction.guild.roles.everyone;
            
            const restorePermissions = {};
            if (lockInfo.originalPermissions.SendMessages !== null) {
                restorePermissions.SendMessages = lockInfo.originalPermissions.SendMessages;
            }
            if (lockInfo.originalPermissions.AddReactions !== null) {
                restorePermissions.AddReactions = lockInfo.originalPermissions.AddReactions;
            }
            
            if (Object.keys(restorePermissions).length === 0) {
                await channel.permissionOverwrites.delete(everyoneRole, { reason: `Unlock by ${interaction.user.tag}: ${reason}` });
            } else {
                await channel.permissionOverwrites.edit(everyoneRole, restorePermissions, { reason: `Unlock by ${interaction.user.tag}: ${reason}` });
            }
            
            delete lockdownData[channel.id];
            await setGuildData('channel-lockdowns', interaction.guild.id, lockdownData);
            
            const duration = Date.now() - lockInfo.lockedAt;
            const durationMinutes = Math.floor(duration / 60000);
            const durationText = durationMinutes < 1 ? 'Less than 1 minute' : durationMinutes === 1 ? '1 minute' : `${durationMinutes} minutes`;
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] Channel Unlocked',
                description: `${channel} has been unlocked.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Locked By', value: lockInfo.lockedByTag, inline: true },
                    { name: '[INFO] Duration', value: durationText, inline: true },
                    { name: '[INFO] Unlock Reason', value: reason, inline: false },
                    { name: '[INFO] Original Lockdown Reason', value: lockInfo.reason, inline: false }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            try {
                const unlockNotice = {
                    color: 0x00FF00,
                    title: '[LOCKDOWN LIFTED] Channel Unlocked',
                    description: 'This channel has been unlocked. You can now send messages and add reactions.',
                    fields: [{ name: '[INFO] Reason', value: reason, inline: false }],
                    timestamp: new Date().toISOString()
                };
                await channel.send({ embeds: [unlockNotice] });
            } catch (err) {
                logger.info('[WARNING] Could not send unlock notice to channel:', err.message);
            }
            
            await sendModLog(interaction.guild, {
                action: 'unlock',
                target: { tag: `#${channel.name}`, id: channel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': `<#${channel.id}>`, 'Duration': durationText }
            });
            
            logger.info(`[MODERATION] Channel ${channel.name} was unlocked by ${interaction.user.tag}. Reason: ${reason}`);
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