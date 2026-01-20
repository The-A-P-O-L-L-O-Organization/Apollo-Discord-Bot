// Message Create Event
// Handles automod checks on new messages

import { EmbedBuilder } from 'discord.js';
import {
    getAutomodConfig,
    isExempt,
    isChannelExempt,
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkSpam,
    checkAccountAge
} from '../utils/automod.js';
import { appendToUserArray, generateId, getUserData, getGuildData } from '../utils/dataStore.js';
import { sendModLog } from '../utils/modLog.js';
import { config } from '../config/config.js';

export default {
    name: 'messageCreate',
    once: false,
    
    async execute(message, client) {
        // Ignore DMs
        if (!message.guild) return;
        
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Get automod config
        const cfg = getAutomodConfig(message.guild.id);
        
        // Check if automod is enabled
        if (!cfg.enabled) return;
        
        // Check if channel is exempt
        if (isChannelExempt(message.channel.id, cfg)) return;
        
        // Get member and check if exempt
        const member = message.member;
        if (!member) return;
        
        if (isExempt(member, cfg)) return;
        
        // Run all checks
        try {
            // Check account age (warn only, don't delete)
            if (cfg.minAccountAge > 0) {
                const isTooNew = checkAccountAge(message.author, cfg.minAccountAge);
                if (isTooNew) {
                    await handleViolation(message, 'new_account', 
                        `Account is less than ${cfg.minAccountAge} days old`, client);
                    // Don't return - still check other things
                }
            }
            
            // Check banned words
            if (cfg.bannedWords.length > 0) {
                const matchedWord = checkBannedWords(message.content, cfg.bannedWords);
                if (matchedWord) {
                    await handleViolation(message, 'banned_word', 
                        `Used banned word`, client, true);
                    return;
                }
            }
            
            // Check invite links
            if (cfg.filterInvites) {
                const hasInvite = checkInvites(message.content);
                if (hasInvite) {
                    await handleViolation(message, 'invite_link', 
                        'Posted Discord invite link', client, true);
                    return;
                }
            }
            
            // Check external links
            if (cfg.filterLinks) {
                const hasLink = checkLinks(message.content);
                if (hasLink) {
                    await handleViolation(message, 'external_link', 
                        'Posted external link', client, true);
                    return;
                }
            }
            
            // Check mention spam
            if (cfg.maxMentions > 0) {
                const isMentionSpam = checkMentionSpam(message, cfg.maxMentions);
                if (isMentionSpam) {
                    await handleViolation(message, 'mention_spam', 
                        `Exceeded ${cfg.maxMentions} mentions`, client, true);
                    return;
                }
            }
            
            // Check caps spam
            if (cfg.maxCapsPercent < 100) {
                const isCapsSpam = checkCapsSpam(message.content, cfg.maxCapsPercent, cfg.minCapsLength || 10);
                if (isCapsSpam) {
                    await handleViolation(message, 'caps_spam', 
                        `Message exceeded ${cfg.maxCapsPercent}% caps`, client, true);
                    return;
                }
            }
            
            // Check message spam
            if (cfg.spamThreshold > 0) {
                const isSpam = checkSpam(message, cfg.spamThreshold, cfg.spamInterval);
                if (isSpam) {
                    await handleViolation(message, 'spam', 
                        `Sent ${cfg.spamThreshold}+ messages in ${cfg.spamInterval / 1000}s`, client, true);
                    return;
                }
            }
            
        } catch (error) {
            console.error('[ERROR] Automod check failed:', error);
        }
    }
};

/**
 * Handles an automod violation
 * @param {Message} message - The offending message
 * @param {string} type - Violation type
 * @param {string} reason - Human-readable reason
 * @param {Client} client - Discord client
 * @param {boolean} deleteMessage - Whether to delete the message
 */
async function handleViolation(message, type, reason, client, deleteMessage = false) {
    try {
        // Delete the message if requested
        if (deleteMessage && message.deletable) {
            await message.delete().catch(() => {});
        }
        
        // Create warning
        const warning = {
            id: generateId(),
            reason: `[AUTOMOD] ${reason}`,
            moderatorId: client.user.id,
            moderatorTag: client.user.tag,
            timestamp: Date.now(),
            active: true,
            automod: true,
            violationType: type
        };
        
        // Add warning to user
        appendToUserArray('warnings', message.guild.id, message.author.id, warning);
        
        // Get warning count
        const userWarnings = getUserData('warnings', message.guild.id, message.author.id) || [];
        const activeWarnings = userWarnings.filter(w => w.active !== false);
        const warningCount = activeWarnings.length;
        
        // Send warning to user in channel (ephemeral-like, delete after delay)
        const warningEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Automod Warning')
            .setDescription(`${message.author}, your message was flagged by automod.`)
            .addFields(
                { name: 'Reason', value: reason, inline: true },
                { name: 'Total Warnings', value: `${warningCount}`, inline: true }
            )
            .setFooter({ text: 'This message will be deleted in 10 seconds' })
            .setTimestamp();
        
        const warningMsg = await message.channel.send({ embeds: [warningEmbed] });
        
        // Delete warning message after 10 seconds
        setTimeout(() => {
            warningMsg.delete().catch(() => {});
        }, 10000);
        
        // Check for auto-punishment thresholds
        const guildSettings = getGuildData('warnings-config', message.guild.id);
        const thresholds = guildSettings.thresholds || config.warnings.thresholds;
        const muteDuration = guildSettings.muteDuration || config.warnings.muteDuration;
        
        let autoPunishment = null;
        const member = message.member;
        
        if (thresholds.ban && warningCount >= thresholds.ban) {
            try {
                await message.guild.bans.create(message.author.id, {
                    reason: `[AUTOMOD] Auto-ban: Reached ${warningCount} warnings`
                });
                autoPunishment = 'banned';
            } catch (e) {
                console.error('[AUTOMOD] Auto-ban failed:', e);
            }
        } else if (thresholds.kick && warningCount >= thresholds.kick) {
            try {
                if (member && member.kickable) {
                    await member.kick(`[AUTOMOD] Auto-kick: Reached ${warningCount} warnings`);
                    autoPunishment = 'kicked';
                }
            } catch (e) {
                console.error('[AUTOMOD] Auto-kick failed:', e);
            }
        } else if (thresholds.mute && warningCount >= thresholds.mute) {
            try {
                if (member && member.moderatable) {
                    await member.timeout(muteDuration, `[AUTOMOD] Auto-mute: Reached ${warningCount} warnings`);
                    autoPunishment = 'muted';
                }
            } catch (e) {
                console.error('[AUTOMOD] Auto-mute failed:', e);
            }
        }
        
        // Log to mod-logs
        await sendModLog(message.guild, {
            action: 'automod',
            target: message.author,
            moderator: client.user,
            reason: reason,
            extra: {
                'Violation Type': type,
                'Message Deleted': deleteMessage ? 'Yes' : 'No',
                'Channel': `#${message.channel.name}`,
                'Warning Count': `${warningCount}`,
                'Auto-Punishment': autoPunishment || 'None'
            }
        });
        
        console.log(`[AUTOMOD] ${type} violation by ${message.author.tag} in ${message.guild.name}`);
        
    } catch (error) {
        console.error('[ERROR] Automod violation handling failed:', error);
    }
}
