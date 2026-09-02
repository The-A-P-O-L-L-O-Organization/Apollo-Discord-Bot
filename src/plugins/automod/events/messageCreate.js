// Message Create Event
// Handles automod checks on new messages
import { logger } from '../../../utils/logger.js';
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
    checkBurstSpam,
    checkSpamRedis,
    trackMessageRedis,
    checkAccountAge,
    checkPhishingLinks
} from '../../../utils/automod.js';
import { 
    checkSustainedSpamRedis, 
    getThreatScore, 
    getRecommendedAction,
    updateThreatScore,
    getViolationCount 
} from '../../../utils/threatScore.js';
import { checkRaidPattern, handleRaidDetected } from '../../../utils/raidDetection.js';
import { appendToUserArray, generateId, getUserData, getGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { config } from '../../../config/config.js';
import { trackMessage, trackViolation, flushAnalyticsCritical } from '../../../utils/analyticsCollector.js';
import { checkMessageModeration, formatViolations } from '../../../utils/openaiModeration.js';
import { checkMessageAttachments, enqueueNsfwAnalysis } from '../../../utils/nsfwDetection.js';
import { getLockRedis } from '../../../utils/lock.js';
import { 
    recordSpamDetection, 
    recordSpamConfidence, 
    recordThreatScore, 
    recordSpamAction 
} from '../../../utils/metrics.js';

export default {
    name: 'messageCreate',
    once: false,
    
    async execute(message, client) {
        // Ignore DMs
        if (!message.guild) {return;}
        
        // Ignore bots and webhooks (prevent false positives from bot commands, webhooks)
        if (message.author.bot || message.webhookId) {return;}
        
        // Track message for analytics
        trackMessage(message.guild.id, message.channel.id, message.author.id);
        
        // Get automod config
        const cfg = await getAutomodConfig(message.guild.id);
        
        // Check if automod is enabled
        if (!cfg.enabled) {return;}
        
        // Check if channel is exempt
        if (isChannelExempt(message.channel.id, cfg)) {return;}
        
        // Get member and check if exempt
        const member = message.member;
        if (!member) {return;}
        
        if (isExempt(member, cfg)) {return;}
        
        // Run all checks
        try {
            // Per-user violation cooldown (prevent spam)
            const violationCooldownKey = `automod_violation_${message.guild.id}_${message.author.id}`;
            const violations = await getUserData(violationCooldownKey, message.guild.id, message.author.id);
            const lastViolation = Array.isArray(violations) && violations.length > 0 ? violations[violations.length - 1] : violations;
            if (lastViolation && Date.now() - lastViolation < 5000) {
                return; // Skip if user had violation in last 5 seconds
            }
            
            // Check account age (warn only, don't delete)
            if (cfg.minAccountAge > 0) {
                const isTooNew = checkAccountAge(message.author, cfg.minAccountAge);
                if (isTooNew) {
                    await handleViolation(message, 'new_account', 
                        `Account is less than ${cfg.minAccountAge} days old`, client, false, violationCooldownKey);
                    // Don't return - still check other things
                }
            }
            
            // Check banned words
            if (cfg.bannedWords.length > 0) {
                const matchedWord = checkBannedWords(message.content, cfg.bannedWords);
                if (matchedWord) {
                    await handleViolation(message, 'banned_word', 
                        'Used banned word', client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check invite links
            if (cfg.filterInvites) {
                const hasInvite = checkInvites(message.content);
                if (hasInvite) {
                    await handleViolation(message, 'invite_link', 
                        'Posted Discord invite link', client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check external links
            if (cfg.filterLinks) {
                const hasLink = checkLinks(message.content);
                if (hasLink) {
                    await handleViolation(message, 'external_link', 
                        'Posted external link', client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check phishing links
            if (cfg.filterPhishingLinks) {
                const phishingResult = checkPhishingLinks(message.content);
                if (phishingResult) {
                    await handleViolation(message, 'phishing_link', 
                        `Phishing link detected: ${phishingResult.reason} (${phishingResult.domain})`, client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check mention spam
            if (cfg.maxMentions > 0) {
                const isMentionSpam = checkMentionSpam(message, cfg.maxMentions);
                if (isMentionSpam) {
                    await handleViolation(message, 'mention_spam', 
                        `Exceeded ${cfg.maxMentions} mentions`, client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check caps spam
            if (cfg.maxCapsPercent < 100) {
                const isCapsSpam = checkCapsSpam(message.content, cfg.maxCapsPercent, cfg.minCapsLength || 10);
                if (isCapsSpam) {
                    await handleViolation(message, 'caps_spam', 
                        `Message exceeded ${cfg.maxCapsPercent}% caps`, client, true, violationCooldownKey);
                    return;
                }
            }
            
            // Check message spam - Dual window detection (burst + sustained)
            if (cfg.spamThreshold > 0) {
                const guildId = message.guild.id;
                const userId = message.author.id;
                
                // 1. Burst detection (in-memory, SimHash-based) - use config values + per-channel overrides
                const burstResult = await checkBurstSpam(message, cfg.spamThreshold, cfg.spamInterval, cfg.spamChannelOverrides || {});
                
                // 2. Sustained detection (Redis ZSET sliding window)
                let sustainedResult = { isSpam: false, confidence: 0, count: 0 };
                if (config.queue.enabled) {
                    sustainedResult = await checkSustainedSpamRedis(guildId, userId, cfg.spamThreshold, cfg.spamInterval);
                }
                
                // 3. Get threat score for progressive action
                const threatScore = await getThreatScore(guildId, userId);
                const violationCount = await getViolationCount(guildId, userId, 24);
                
                // 4. Confidence gating - no punitive action below 0.85 confidence
                const maxConfidence = Math.max(burstResult.confidence, sustainedResult.confidence);
                const isSpam = burstResult.isSpam || sustainedResult.isSpam;
                
                // Record metrics
                const detectionType = burstResult.isSpam ? (sustainedResult.isSpam ? 'burst+sustained' : 'burst') : 'sustained';
                recordSpamDetection(guildId, detectionType, 'none');
                recordSpamConfidence(guildId, detectionType, maxConfidence);
                recordThreatScore(guildId, threatScore);
                
                if (isSpam && maxConfidence >= 0.85) {
                    // Update threat score based on detection type
                    const severity = burstResult.isSpam ? 'high' : 'medium';
                    await updateThreatScore(guildId, userId, 'spam', severity);
                    
                    // Get recommended action based on threat score
                    const { action, duration } = getRecommendedAction(threatScore, violationCount);
                    
                    let deleteMessage = true;
                    if (action === 'warn') {
                        deleteMessage = false;
                    } else if (action === 'timeout' && duration) {
                        // Timeout handled by handleViolation through warning thresholds
                        deleteMessage = true;
                    }
                    
                    // Record action metric
                    recordSpamDetection(guildId, detectionType, action);
                    recordSpamAction(guildId, action);
                    
                    await handleViolation(message, 'spam', 
                        `Spam detected: ${burstResult.isSpam ? 'burst' : ''}${burstResult.isSpam && sustainedResult.isSpam ? ' + ' : ''}${sustainedResult.isSpam ? 'sustained' : ''} (confidence: ${(maxConfidence * 100).toFixed(0)}%, threat: ${threatScore})`, 
                        client, deleteMessage, violationCooldownKey);
                    return;
                } else if (isSpam && maxConfidence < 0.85) {
                    // Low confidence - log but don't punish
                    logger.debug(`[AUTOMOD] Low-confidence spam detection (${(maxConfidence * 100).toFixed(0)}%) for ${message.author.tag} - not actioning`);
                }
            }

            // Check raid detection (coordinated attack via messages)
            if (cfg.raidDetection) {
                const isRaid = await checkRaidPattern(message.guild.id, message.member, cfg);
                if (isRaid) {
                    await handleRaidDetected(message.guild, message.member);
                    // Don't return - still check other things
                }
            }

            // Check AI moderation (OpenAI Moderation API)
            if (cfg.aiModeration) {
                const moderationResult = await checkMessageModeration(message.content);
                if (moderationResult) {
                    const reason = `AI moderation flagged: ${formatViolations(moderationResult.violations)}`;
                    await handleViolation(message, 'ai_moderation', reason, client, true, violationCooldownKey);
                    return;
                }
            }

            // Check NSFW image attachments
            if (cfg.nsfwFilter && message.attachments.size > 0) {
                // Use worker queue for NSFW analysis if queue is enabled
                if (config.queue.enabled) {
                    const imageAttachments = message.attachments.filter(att => {
                        const contentType = att.contentType || '';
                        return contentType.startsWith('image/');
                    });
                    
                    for (const [, attachment] of imageAttachments) {
                        try {
                            await enqueueNsfwAnalysis(attachment.url, message.guild.id, config.threshold);
                        } catch (error) {
                            logger.error(`[ERROR] Failed to enqueue NSFW analysis for ${attachment.name}:`, error.message);
                        }
                    }
                } else {
                    // Fallback to synchronous analysis
                    const nsfwResult = await checkMessageAttachments(message.guild.id, message, true);
                    if (nsfwResult && nsfwResult.detected) {
                        const count = nsfwResult.images.length;
                        const reason = `Posted NSFW image${count > 1 ? 's' : ''} (${count} detected)`;
                        await handleViolation(message, 'nsfw', reason, client, true, violationCooldownKey);
                        return;
                    }
                }
            }
            
        } catch (error) {
            logger.error('[ERROR] Automod check failed:', error);
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
 * @param {string} violationCooldownKey - Key for violation cooldown tracking
 */
async function handleViolation(message, type, reason, client, deleteMessage = false, violationCooldownKey) {
    try {
        // Track violation for analytics
        trackViolation(message.guild.id, type);
        
        // Set violation cooldown (5 seconds)
        if (violationCooldownKey) {
            await appendToUserArray(violationCooldownKey, message.guild.id, message.author.id, Date.now());
        }
        
        // Flush critical analytics immediately
        await flushAnalyticsCritical();
        
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
        await appendToUserArray('warnings', message.guild.id, message.author.id, warning);
        
        // Get warning count
        const userWarnings = await getUserData('warnings', message.guild.id, message.author.id) || [];
        const activeWarnings = userWarnings.filter(w => w.active !== false);
        const warningCount = activeWarnings.length;
        
        // Send warning to user in channel (ephemeral-like, delete after delay)
        const warningEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('[!] Automod Warning')
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
            warningMsg.delete().catch(err => logger.error('[WARN] Failed to delete warning message:', err.message));
        }, 10000);
        
        // Check for auto-punishment thresholds
        const guildSettings = await getGuildData('warnings-config', message.guild.id);
        const thresholds = guildSettings?.thresholds || config.warnings.thresholds;
        const muteDuration = guildSettings?.muteDuration || config.warnings.muteDuration;
        
        let autoPunishment = null;
        const member = message.member;
        
        if (thresholds.ban && warningCount >= thresholds.ban) {
            try {
                await message.guild.bans.create(message.author.id, {
                    reason: `[AUTOMOD] Auto-ban: Reached ${warningCount} warnings`
                });
                autoPunishment = 'banned';
            } catch (e) {
                logger.error('[AUTOMOD] Auto-ban failed:', e);
            }
        } else if (thresholds.kick && warningCount >= thresholds.kick) {
            try {
                if (member && member.kickable) {
                    await member.kick(`[AUTOMOD] Auto-kick: Reached ${warningCount} warnings`);
                    autoPunishment = 'kicked';
                }
            } catch (e) {
                logger.error('[AUTOMOD] Auto-kick failed:', e);
            }
        } else if (thresholds.mute && warningCount >= thresholds.mute) {
            try {
                if (member && member.moderatable) {
                    await member.timeout(muteDuration, `[AUTOMOD] Auto-mute: Reached ${warningCount} warnings`);
                    autoPunishment = 'muted';
                }
            } catch (e) {
                logger.error('[AUTOMOD] Auto-mute failed:', e);
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
        
        logger.info(`[AUTOMOD] ${type} violation by ${message.author.tag} in ${message.guild.name}`);
        
    } catch (error) {
        logger.error('[ERROR] Automod violation handling failed:', error);
    }
}
