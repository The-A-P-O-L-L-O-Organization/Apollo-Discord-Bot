// Logger Utility
// Centralized logging function for all server events

import { EmbedBuilder } from 'discord.js';
import { getGuildData } from './dataStore.js';
import { config } from '../config/config.js';

/**
 * Gets logging configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Object} Logging configuration
 */
export function getLoggingConfig(guildId) {
    const guildConfig = getGuildData('logging', guildId);
    return {
        channelId: guildConfig.channelId || null,
        events: {
            messageDelete: guildConfig.events?.messageDelete ?? config.logging.defaultEvents.messageDelete,
            messageEdit: guildConfig.events?.messageEdit ?? config.logging.defaultEvents.messageEdit,
            memberJoin: guildConfig.events?.memberJoin ?? config.logging.defaultEvents.memberJoin,
            memberLeave: guildConfig.events?.memberLeave ?? config.logging.defaultEvents.memberLeave,
            roleChanges: guildConfig.events?.roleChanges ?? config.logging.defaultEvents.roleChanges,
            voiceChanges: guildConfig.events?.voiceChanges ?? config.logging.defaultEvents.voiceChanges
        }
    };
}

/**
 * Checks if an event is enabled for logging
 * @param {string} guildId - The guild ID
 * @param {string} eventName - The event name
 * @returns {boolean} Whether the event is enabled
 */
export function isEventEnabled(guildId, eventName) {
    const cfg = getLoggingConfig(guildId);
    return cfg.channelId && cfg.events[eventName];
}

/**
 * Gets the logging channel for a guild
 * @param {Guild} guild - The Discord guild
 * @returns {Promise<TextChannel|null>} The logging channel or null
 */
export async function getLogChannel(guild) {
    const cfg = getLoggingConfig(guild.id);
    
    if (!cfg.channelId) return null;
    
    try {
        const channel = await guild.channels.fetch(cfg.channelId);
        if (channel && channel.isTextBased()) {
            return channel;
        }
    } catch (error) {
        console.error(`[ERROR] Could not fetch log channel for ${guild.name}:`, error.message);
    }
    
    return null;
}

/**
 * Logs an event to the server's log channel
 * @param {Guild} guild - The Discord guild
 * @param {string} eventType - The type of event
 * @param {EmbedBuilder} embed - The embed to send
 */
export async function logEvent(guild, eventType, embed) {
    if (!isEventEnabled(guild.id, eventType)) return;
    
    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;
    
    try {
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error(`[ERROR] Failed to send log to ${guild.name}:`, error.message);
    }
}

/**
 * Creates a message delete log embed
 * @param {Message} message - The deleted message
 * @returns {EmbedBuilder} The log embed
 */
export function createMessageDeleteEmbed(message) {
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🗑️ Message Deleted')
        .setDescription(message.content || '*No text content*')
        .addFields(
            { name: 'Author', value: `${message.author?.tag || 'Unknown'} (${message.author?.id || 'Unknown'})`, inline: true },
            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Message ID', value: message.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Message Deleted' });
    
    // Add attachment info if any
    if (message.attachments.size > 0) {
        const attachmentList = message.attachments.map(a => a.url).join('\n');
        embed.addFields({
            name: `Attachments (${message.attachments.size})`,
            value: attachmentList.substring(0, 1024),
            inline: false
        });
    }
    
    // Add author thumbnail if available
    if (message.author) {
        embed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
    }
    
    return embed;
}

/**
 * Creates a message edit log embed
 * @param {Message} oldMessage - The old message
 * @param {Message} newMessage - The new message
 * @returns {EmbedBuilder} The log embed
 */
export function createMessageEditEmbed(oldMessage, newMessage) {
    const embed = new EmbedBuilder()
        .setColor('#FFE66D')
        .setTitle('✏️ Message Edited')
        .addFields(
            { name: 'Author', value: `${newMessage.author?.tag || 'Unknown'} (${newMessage.author?.id || 'Unknown'})`, inline: true },
            { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: 'Jump to Message', value: `[Click Here](${newMessage.url})`, inline: true },
            { name: 'Before', value: (oldMessage.content || '*Empty*').substring(0, 1024), inline: false },
            { name: 'After', value: (newMessage.content || '*Empty*').substring(0, 1024), inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Message ID: ${newMessage.id}` });
    
    if (newMessage.author) {
        embed.setThumbnail(newMessage.author.displayAvatarURL({ dynamic: true }));
    }
    
    return embed;
}

/**
 * Creates a member join log embed
 * @param {GuildMember} member - The member who joined
 * @returns {EmbedBuilder} The log embed
 */
export function createMemberJoinEmbed(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const daysOld = Math.floor(accountAge / (1000 * 60 * 60 * 24));
    
    const embed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('📥 Member Joined')
        .setDescription(`${member.user.tag} joined the server`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'User', value: `<@${member.id}>`, inline: true },
            { name: 'User ID', value: member.id, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Account Age', value: `${daysOld} days`, inline: true },
            { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Member Joined' });
    
    // Flag new accounts
    if (daysOld < 7) {
        embed.addFields({
            name: '⚠️ New Account Warning',
            value: `This account is less than 7 days old.`,
            inline: false
        });
    }
    
    return embed;
}

/**
 * Creates a member leave log embed
 * @param {GuildMember} member - The member who left
 * @returns {EmbedBuilder} The log embed
 */
export function createMemberLeaveEmbed(member) {
    const joinedAt = member.joinedTimestamp;
    const timeInServer = joinedAt ? Date.now() - joinedAt : null;
    const daysInServer = timeInServer ? Math.floor(timeInServer / (1000 * 60 * 60 * 24)) : 'Unknown';
    
    // Get roles (excluding @everyone)
    const roles = member.roles.cache
        .filter(r => r.id !== member.guild.id)
        .map(r => r.name)
        .join(', ') || 'None';
    
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('📤 Member Left')
        .setDescription(`${member.user.tag} left the server`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'User', value: `${member.user.tag}`, inline: true },
            { name: 'User ID', value: member.id, inline: true },
            { name: 'Time in Server', value: `${daysInServer} days`, inline: true },
            { name: 'Joined', value: joinedAt ? `<t:${Math.floor(joinedAt / 1000)}:F>` : 'Unknown', inline: true },
            { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
            { name: 'Roles', value: roles.substring(0, 1024), inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Member Left' });
    
    return embed;
}

/**
 * Creates a role change log embed
 * @param {GuildMember} oldMember - The old member state
 * @param {GuildMember} newMember - The new member state
 * @returns {EmbedBuilder|null} The log embed or null if no role changes
 */
export function createRoleChangeEmbed(oldMember, newMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    
    const addedRoles = newRoles.filter(r => !oldRoles.has(r.id));
    const removedRoles = oldRoles.filter(r => !newRoles.has(r.id));
    
    // No role changes
    if (addedRoles.size === 0 && removedRoles.size === 0) {
        return null;
    }
    
    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🏷️ Role Update')
        .setDescription(`Roles updated for ${newMember.user.tag}`)
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'User', value: `<@${newMember.id}>`, inline: true },
            { name: 'User ID', value: newMember.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Role Update' });
    
    if (addedRoles.size > 0) {
        embed.addFields({
            name: '➕ Roles Added',
            value: addedRoles.map(r => r.name).join(', '),
            inline: false
        });
    }
    
    if (removedRoles.size > 0) {
        embed.addFields({
            name: '➖ Roles Removed',
            value: removedRoles.map(r => r.name).join(', '),
            inline: false
        });
    }
    
    return embed;
}

/**
 * Creates a voice state change log embed
 * @param {VoiceState} oldState - The old voice state
 * @param {VoiceState} newState - The new voice state
 * @returns {EmbedBuilder|null} The log embed or null if not significant
 */
export function createVoiceChangeEmbed(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member) return null;
    
    let title, description, color;
    
    if (!oldState.channel && newState.channel) {
        // Joined voice channel
        title = '🔊 Voice Channel Joined';
        description = `${member.user.tag} joined a voice channel`;
        color = '#4ECDC4';
    } else if (oldState.channel && !newState.channel) {
        // Left voice channel
        title = '🔇 Voice Channel Left';
        description = `${member.user.tag} left a voice channel`;
        color = '#FF6B6B';
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        // Moved voice channels
        title = '🔀 Voice Channel Moved';
        description = `${member.user.tag} moved voice channels`;
        color = '#FFE66D';
    } else {
        // Other state change (mute, deafen, etc.) - skip for now
        return null;
    }
    
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'User', value: `<@${member.id}>`, inline: true },
            { name: 'User ID', value: member.id, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Voice Update' });
    
    if (oldState.channel) {
        embed.addFields({ name: 'From', value: oldState.channel.name, inline: true });
    }
    
    if (newState.channel) {
        embed.addFields({ name: 'To', value: newState.channel.name, inline: true });
    }
    
    return embed;
}
