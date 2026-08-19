// SLA Monitor Event
// Periodically checks open tickets for SLA breaches and sends alerts

import { EmbedBuilder, ChannelType } from 'discord.js';
import { getGuildData, getAllGuildIds } from '../../../utils/db.js';
import { hasBreachedSLA, DEFAULT_SLA_THRESHOLDS, formatTime, getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';
import { sendModLog } from '../../../utils/modLog.js';
import { config } from '../../../config/config.js';

// Track which tickets have already been alerted to avoid spam
// Map<guildId, Map<ticketId, { alertedAt, count }>>
const alertedTickets = new Map();

// Check interval: 5 minutes
const CHECK_INTERVAL = 5 * 60 * 1000;

// Alert cooldown per ticket: 30 minutes
const ALERT_COOLDOWN = 30 * 60 * 1000;

/**
 * Starts the SLA monitor
 * @param {Client} client - Discord client
 */
export function startSlaMonitor(client) {
    console.log('[SLA] Starting SLA monitor...');
    
    // Initial check
    checkAllTickets(client);
    
    // Periodic checks
    setInterval(() => {
        checkAllTickets(client);
    }, CHECK_INTERVAL);
}

/**
 * Checks all open tickets across all guilds for SLA breaches
 * Uses per-guild polling to avoid loading all data at once
 * @param {Client} client - Discord client
 */
async function checkAllTickets(client) {
    try {
        // Get all guild IDs that have tickets configured
        const guildIds = await getAllGuildIds('tickets');
        
        // Process guilds in batches to avoid blocking
        const BATCH_SIZE = 10;
        for (let i = 0; i < guildIds.length; i += BATCH_SIZE) {
            const batch = guildIds.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(async (guildId) => {
                try {
                    await checkGuildTickets(client, guildId);
                } catch (error) {
                    console.error(`[SLA] Error checking guild ${guildId}:`, error);
                }
            }));
            
            // Small delay between batches
            if (i + BATCH_SIZE < guildIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        console.error('[SLA] Error checking tickets:', error);
    }
}

/**
 * Checks tickets for a specific guild
 * @param {Client} client - Discord client
 * @param {string} guildId - Guild ID
 */
async function checkGuildTickets(client, guildId) {
    const ticketConfig = await getGuildData('tickets', guildId);
    
    if (!ticketConfig.openTickets || ticketConfig.openTickets.length === 0) {
        return;
    }
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return;
    }
    
    const slaThresholds = ticketConfig.slaThresholds || DEFAULT_SLA_THRESHOLDS;
    
    for (const ticket of ticketConfig.openTickets) {
        if (hasBreachedSLA(ticket, slaThresholds)) {
            await handleSlaBreach(guild, ticket, slaThresholds, client);
        }
    }
}

/**
 * Handles an SLA breach for a ticket
 * @param {Guild} guild - The guild
 * @param {object} ticket - The ticket that breached SLA
 * @param {object} slaThresholds - SLA thresholds
 * @param {Client} client - Discord client
 */
async function handleSlaBreach(guild, ticket, slaThresholds, client) {
    const now = Date.now();
    
    // Check if already alerted (with cooldown)
    if (!alertedTickets.has(guild.id)) {
        alertedTickets.set(guild.id, new Map());
    }
    
    const guildAlerted = alertedTickets.get(guild.id);
    const existingAlert = guildAlerted.get(ticket.id);
    
    if (existingAlert) {
        // Check cooldown
        if (now - existingAlert.alertedAt < ALERT_COOLDOWN) {
            return; // Still in cooldown
        }
        // Increment alert count
        existingAlert.count++;
        existingAlert.alertedAt = now;
    } else {
        guildAlerted.set(ticket.id, { alertedAt: now, count: 1 });
    }
    
    // Clean up old alerts periodically
    if (guildAlerted.size > 1000) {
        const entries = Array.from(guildAlerted.entries());
        guildAlerted.clear();
        // Keep last 500
        entries.slice(-500).forEach(([key, value]) => guildAlerted.set(key, value));
    }
    
    const threshold = slaThresholds[ticket.priority] || DEFAULT_SLA_THRESHOLDS.medium;
    const elapsed = now - ticket.createdAt;
    
    // Find mod log channel
    const modChannel = guild.channels.cache.find(
        ch => ch.name === config.moderation.moderationLogChannel && ch.type === ChannelType.GuildText
    );
    
    // Find ticket channel
    const ticketChannel = guild.channels.cache.get(ticket.channelId);
    
    // Create breach alert embed
    const alertEmbed = new EmbedBuilder()
        .setColor(getPriorityColor(ticket.priority))
        .setTitle(`${getPriorityEmoji(ticket.priority)} SLA BREACH - Ticket #${ticket.ticketNumber}`)
        .setDescription(`Ticket **#${ticket.ticketNumber}** has breached its SLA response time.`)
        .addFields(
            { name: 'Priority', value: `${getPriorityEmoji(ticket.priority)} ${ticket.priority.toUpperCase()}`, inline: true },
            { name: 'SLA Threshold', value: formatTime(threshold), inline: true },
            { name: 'Time Elapsed', value: formatTime(elapsed), inline: true },
            { name: 'Category', value: ticket.category || 'general', inline: true },
            { name: 'Created By', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Created At', value: `<t:${Math.floor(ticket.createdAt / 1000)}:R>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'SLA Monitor • Immediate attention required' });
    
    if (ticketChannel) {
        alertEmbed.addFields({ name: 'Channel', value: ticketChannel.toString(), inline: true });
    }
    
    // Send to mod log channel
    if (modChannel) {
        try {
            // Ping support role if configured
            let content = '';
            const ticketConfig = await getGuildData('tickets', guild.id);
            if (ticketConfig?.supportRoleId) {
                content = `<@&${ticketConfig.supportRoleId}>`;
            }
            
            await modChannel.send({ content, embeds: [alertEmbed] });
        } catch (error) {
            console.error('[SLA] Failed to send breach alert to mod channel:', error);
        }
    }
    
    // Also send to ticket channel if it exists
    if (ticketChannel && ticketChannel.type === ChannelType.GuildText) {
        try {
            const channelAlertEmbed = new EmbedBuilder()
                .setColor(getPriorityColor(ticket.priority))
                .setTitle(`${getPriorityEmoji(ticket.priority)} SLA BREACH ALERT`)
                .setDescription(`This ticket has exceeded its **${formatTime(threshold)}** response time SLA.`)
                .addFields(
                    { name: 'Priority', value: `${getPriorityEmoji(ticket.priority)} ${ticket.priority.toUpperCase()}`, inline: true },
                    { name: 'Time Elapsed', value: formatTime(elapsed), inline: true },
                    { name: 'Action Required', value: 'Support team should respond immediately.', inline: false }
                )
                .setTimestamp();
            
            await ticketChannel.send({ embeds: [channelAlertEmbed] });
        } catch (error) {
            console.error('[SLA] Failed to send breach alert to ticket channel:', error);
        }
    }
    
    // Log to mod log system
    try {
        await sendModLog(guild, {
            action: 'sla_breach',
            target: { id: ticket.userId, tag: `Ticket #${ticket.ticketNumber}`, displayAvatarURL: () => null },
            moderator: { tag: 'SLA Monitor', id: client.user.id, displayAvatarURL: () => client.user.displayAvatarURL() },
            reason: `SLA breached for ticket #${ticket.ticketNumber} (${ticket.priority} priority)`,
            extra: {
                'Ticket Number': `#${ticket.ticketNumber}`,
                'Priority': ticket.priority,
                'Category': ticket.category || 'general',
                'SLA Threshold': formatTime(threshold),
                'Time Elapsed': formatTime(elapsed),
                'Channel': ticketChannel ? `#${ticketChannel.name}` : 'Unknown',
                'Alert Count': guildAlerted.get(ticket.id)?.count || 1
            }
        });
    } catch (error) {
        console.error('[SLA] Failed to log SLA breach:', error);
    }
    
    console.log(`[SLA] Breach alert sent for ticket #${ticket.ticketNumber} in ${guild.name}`);
}

/**
 * Clears the alerted status for a ticket (call when ticket is responded to)
 * @param {string} guildId - Guild ID
 * @param {string} ticketId - Ticket ID
 */
export function clearSlaAlert(guildId, ticketId) {
    if (alertedTickets.has(guildId)) {
        alertedTickets.get(guildId).delete(ticketId);
    }
}

/**
 * Gets the current alerted tickets for a guild
 * @param {string} guildId - Guild ID
 * @returns {Map<string, object>} Map of ticket IDs to alert info
 */
export function getAlertedTickets(guildId) {
    return alertedTickets.get(guildId) || new Map();
}

export default {
    startSlaMonitor,
    handleSlaBreach,
    clearSlaAlert,
    getAlertedTickets
};