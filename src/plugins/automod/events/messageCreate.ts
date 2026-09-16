import { createLogger } from '../../../utils/logger.js';
import { trackMessage, trackViolation, flushAnalyticsCritical } from '../../../utils/analyticsCollector.js';
import { getGuildData, updateGuildData, appendToUserArray, generateId } from '../../../utils/db.js';
import { checkSpam, checkBurstSpam, getAutomodConfig, isExempt, isChannelExempt, checkBannedWords, checkInvites, checkLinks, checkMentionSpam, checkCapsSpam, checkPhishingLinks, checkAccountAge } from '../../../utils/automod.js';
import { checkMessageAttachments, isNsfwDetectionAvailable } from '../../../utils/nsfwDetection.js';
import { enqueueNsfwAnalysis } from '../../../utils/nsfwDetection.js';
import { logEvent } from '../../../utils/guildLogging.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { isRaidModeEnabled } from '../../../utils/raidDetection.js';
import { sendModLog } from '../../../utils/modLog.js';
import { config } from '../../../config/config.js';
import type { Message, User, Client } from 'discord.js';
import { EmbedBuilder, Colors, MessageFlags, PermissionFlagsBits, GuildMember, TextChannel, ThreadChannel, NewsChannel, Guild } from 'discord.js';

const logger = createLogger({ component: 'automod:messageCreate' });

function createModerationEmbed(data: { action: string; user: User; moderator: User; reason: string; details?: string; caseId: string }): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`[MOD] ${data.action}`)
        .setColor(Colors.Red)
        .addFields(
            { name: 'User', value: `${data.user.tag} (${data.user.id})`, inline: true },
            { name: 'Moderator', value: data.moderator.tag, inline: true },
            { name: 'Reason', value: data.reason, inline: false },
            { name: 'Case ID', value: data.caseId, inline: true }
        )
        .setTimestamp();
    if (data.details) {
        embed.addFields({ name: 'Details', value: data.details, inline: false });
    }
    return embed;
}

interface Violation {
    type: string;
    details?: string;
    channelId?: string;
    action?: string;
    punishment?: string;
}

interface AutomodConfig {
    enabled?: boolean;
    bannedWords?: string[];
    inviteFilter?: boolean;
    linkFilter?: boolean;
    mentionFilter?: boolean;
    mentionThreshold?: number;
    capsFilter?: boolean;
    capsThreshold?: number;
    capsMinLength?: number;
    phishingFilter?: boolean;
    accountAgeFilter?: boolean;
    accountAgeMinDays?: number;
    spamFilter?: boolean;
    spamThreshold?: number;
    spamWindow?: number;
    nsfwFilter?: boolean;
    nsfwThreshold?: number;
    exemptChannels?: string[];
    exemptRoles?: string[];
    autoPunish?: {
        enabled?: boolean;
        warningsToBan?: number;
        warningsToKick?: number;
        warningsToMute?: number;
        muteDuration?: string;
    };
}

function normalizeText(text: string): string {
    return text.toLowerCase()
        .replace(/[4@]/g, 'a')
        .replace(/[3]/g, 'e')
        .replace(/[1!|]/g, 'i')
        .replace(/[0]/g, 'o')
        .replace(/[5$]/g, 's')
        .replace(/[7]/g, 't')
        .replace(/[2]/g, 'z')
        .replace(/[6]/g, 'g')
        .replace(/[8]/g, 'b')
        .replace(/[9]/g, 'g')
        .replace(/[\[\]\(\)\{\}\*\-\_\+\=\|\<\>\`\~]/g, '');
}

async function handleViolation(message: Message, type: string, reason: string, client: Client, deleteMessage = true, violationCooldownKey?: string): Promise<void> {
    const guildId = message.guild!.id;
    const userId = message.author.id;

    // Track violation for analytics
    trackViolation(guildId, type);

    // Set violation cooldown (5 seconds)
    if (violationCooldownKey) {
        await appendToUserArray(violationCooldownKey, guildId, userId, Date.now());
    }

    // Flush critical analytics immediately
    await import('../../../utils/analyticsCollector.js').then(m => m.flushAnalyticsCritical());

    // Delete the message if requested
    if (deleteMessage && message.deletable) {
        await message.delete().catch(() => {});
    }

    // Create warning
    const warning = {
        id: (await import('../../../utils/db.js')).generateId(),
        reason: `[AUTOMOD] ${reason}`,
        moderatorId: client.user.id,
        moderatorTag: client.user.tag,
        timestamp: Date.now(),
        active: true,
        automod: true,
        violationType: type
    };

    // Add warning to user
    await appendToUserArray('warnings', guildId, userId, warning);

    // Get warning count
    const userWarnings = await import('../../../utils/db.js').then(m => m.getUserData('warnings', guildId, userId)) || [];
    const activeWarnings = userWarnings.filter((w: { active: boolean }) => w.active !== false);
    const warningCount = activeWarnings.length;

    // Send warning to user in channel
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
        warningMsg.delete().catch(err => logger.error({ msg: '[WARN] Failed to delete warning message', error: err }));
    }, 10000);

    // Check for auto-punishment thresholds
    const guildSettings = await getGuildData('warnings-config', guildId);
    const thresholds = guildSettings?.thresholds || config.warnings.thresholds;
    const muteDuration = guildSettings?.muteDuration || config.warnings.muteDuration;

    let autoPunishment = null;
    const member = message.member;

    if (thresholds.ban && warningCount >= thresholds.ban) {
        try {
            await message.guild.bans.create(userId, {
                reason: `[AUTOMOD] Auto-ban: Reached ${warningCount} warnings`
            });
            autoPunishment = 'banned';
        } catch (e) {
            logger.error({ msg: '[AUTOMOD] Auto-ban failed', error: e });
        }
    } else if (thresholds.kick && warningCount >= thresholds.kick) {
        try {
            if (member && member.kickable) {
                await member.kick(`[AUTOMOD] Auto-kick: Reached ${warningCount} warnings`);
                autoPunishment = 'kicked';
            }
        } catch (e) {
            logger.error({ msg: '[AUTOMOD] Auto-kick failed', error: e });
        }
    } else if (thresholds.mute && warningCount >= thresholds.mute) {
        try {
            if (member && member.moderatable) {
                await member.timeout(muteDuration, `[AUTOMOD] Auto-mute: Reached ${warningCount} warnings`);
                autoPunishment = 'muted';
            }
        } catch (e) {
            logger.error({ msg: '[AUTOMOD] Auto-mute failed', error: e });
        }
    }

    // Log to mod-logs
    await sendModLog(message.guild!, {
        action: 'automod',
        target: message.author,
        moderator: client.user!,
        reason: reason,
        extra: {
            violationType: type,
            warningCount,
            autoPunishment
        }
    });
}

function parseDuration(duration: string): number {
    const match = /^(\d+)([mhdw])$/.exec(duration);
    if (!match) {return 600000;} // 10 minutes default
    const value = parseInt(match[1]!, 10);
    const unit = match[2]!;
    switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 600000;
    }
}

function castConfig(cfg: AutomodConfig): Record<string, unknown> {
    return cfg as unknown as Record<string, unknown>;
}

export default {
    name: 'messageCreate',
    once: false,

    async execute(message: Message, client: Client) {
        if (message.author.bot || !message.guild || message.webhookId) {return;}

        // Skip if no member (DMs, webhooks, etc.)
        if (!message.member) {return;}

        const guildId = message.guild.id;
        const userId = message.author.id;

        // Get automod config
        const automodConfig = await getAutomodConfig(guildId);
        if (!automodConfig.enabled) {return;}

        // Check exemptions
        if (await isExempt(message.member) || await isChannelExempt(message.channel.id)) {
            return;
        }

        // Track message for analytics
        trackMessage(guildId, userId, message.content.length, false);

        // Check raid mode
        if (await isRaidModeEnabled(guildId)) {
            if (message.deletable) {
                try {
                    await message.delete();
                } catch {}
            }
            return;
        }

        // Check account age for new members (only on first message)
        const member = message.member;
        if (member && automodConfig.minAccountAge > 0) {
            const isTooNew = await checkAccountAge(message.author, automodConfig.minAccountAge);
            if (isTooNew) {
                await handleViolation(message, 'new_account', `Account is less than ${automodConfig.minAccountAge} days old`, client, false);
                return;
            }
        }

        // Run content filters
        const violations: Violation[] = [];

        try {
            if (automodConfig.bannedWords && automodConfig.bannedWords.length > 0) {
                const bannedWord = checkBannedWords(message.content, automodConfig.bannedWords || []);
                if (bannedWord) {
                    await handleViolation(message, 'banned_word', 'Used banned word', client, true);
                    return;
                }
            }

            if (automodConfig.filterInvites) {
                const invite = checkInvites(message.content);
                if (invite) {
                    await handleViolation(message, 'invite_link', 'Posted Discord invite link', client, true);
                    return;
                }
            }

            if (automodConfig.filterLinks) {
                const link = checkLinks(message.content);
                if (link) {
                    await handleViolation(message, 'external_link', 'Posted external link', client, true);
                    return;
                }
            }

            if (automodConfig.filterPhishingLinks) {
                const phishing = checkPhishingLinks(message.content);
                if (phishing) {
                    await handleViolation(message, 'phishing_link', 'Phishing link detected', client, true);
                    return;
                }
            }

            if (automodConfig.maxMentions > 0) {
                const mention = checkMentionSpam(message, automodConfig.maxMentions);
                if (mention) {
                    await handleViolation(message, 'mention_spam', `Exceeded ${automodConfig.maxMentions} mentions`, client, true);
                    return;
                }
            }

            if (automodConfig.maxCapsPercent < 100) {
                const caps = checkCapsSpam(message.content, automodConfig.maxCapsPercent, automodConfig.minCapsLength || 10);
                if (caps) {
                    await handleViolation(message, 'caps_spam', `Message exceeded ${automodConfig.maxCapsPercent}% caps`, client, true);
                    return;
                }
            }
        } catch (error) {
            logger.error({ msg: 'Content filter check failed', error });
        }

        // Spam detection (Redis + in-memory)
        if (automodConfig.spamThreshold > 0) {
            try {
                const isSpam = await checkSpam(message, automodConfig.spamThreshold, automodConfig.spamInterval || 10000, true);
                if (isSpam) {
                    violations.push({ type: 'spam', details: `Threshold: ${automodConfig.spamThreshold} msgs/${automodConfig.spamInterval}ms`, channelId: message.channel.id });
                }
                await checkBurstSpam(message);
            } catch (error) {
                logger.error({ msg: 'Spam check failed', error });
            }
        }

        // NSFW detection for attachments
        if (automodConfig.nsfwFilter && message.attachments.size > 0) {
            try {
                if (config.queue?.enabled && isNsfwDetectionAvailable()) {
                    // Queue NSFW analysis for worker
                    for (const attachment of message.attachments.values()) {
                        if (attachment.contentType?.startsWith('image/') || attachment.contentType?.startsWith('video/')) {
                            await enqueueNsfwAnalysis({
                                imageUrl: attachment.url,
                                guildId,
                                channelId: message.channel.id,
                                messageId: message.id,
                                userId,
                                threshold: automodConfig.nsfwThreshold || 0.5
                            });
                        }
                    }
                } else {
                    // Synchronous NSFW check (fallback)
                    const result = await checkMessageAttachments(guildId, message, true);
                    if (result?.shouldDelete) {
                        await handleViolation(message, 'nsfw', 'NSFW content in attachment', client, true);
                        return;
                    }
                }
            } catch (error) {
                logger.error({ msg: 'NSFW detection failed', error });
            }
        }

        // Handle violations
        for (const violation of violations) {
            await handleViolation(message, violation.type, violation.details || violation.type, client, true);
        }
    }
};

function checkInvites(message: Message, config: AutomodConfig): Violation | null {
    if (!config.inviteFilter) {return null;}
    const inviteRegex = /(?:discord\.(?:gg|com\/invite|me)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/gi;
    if (inviteRegex.test(message.content)) {
        return { type: 'invite', channelId: message.channel.id };
    }
    return null;
}

function checkLinks(message: Message, config: AutomodConfig): Violation | null {
    if (!config.linkFilter) {return null;}
    const linkRegex = /https?:\/\/[^\s]+/gi;
    if (linkRegex.test(message.content)) {
        return { type: 'link', channelId: message.channel.id };
    }
    return null;
}

function checkPhishing(message: Message, config: AutomodConfig): Violation | null {
    if (!config.phishingFilter) {return null;}
    const suspiciousPatterns = [
        /bit\.ly/gi,
        /tinyurl\.com/gi,
        /t\.co/gi,
        /cutt\.ly/gi,
        /rebrand\.ly/gi,
        /is\.gd/gi,
        /v\.gd/gi,
        /bc\.vc/gi,
        /shorte\.st/gi,
        /adf\.ly/gi,
        /ouo\.io/gi,
        /ouo\.press/gi
    ];
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(message.content)) {
            return { type: 'phishing', channelId: message.channel.id };
        }
    }
    return null;
}

function checkMentions(message: Message, config: AutomodConfig): Violation | null {
    if (!config.mentionFilter) {return null;}
    const threshold = config.mentionThreshold ?? 5;
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > threshold) {
        return { type: 'mention_spam', details: `${mentionCount} mentions`, channelId: message.channel.id };
    }
    return null;
}

function checkCaps(message: Message, config: AutomodConfig): Violation | null {
    if (!config.capsFilter) {return null;}
    const threshold = config.capsThreshold ?? 70;
    const minLength = config.capsMinLength ?? 10;
    const content = message.content;
    if (content.length < minLength) {return null;}
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < minLength) {return null;}
    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    const percent = (upperCount / letters.length) * 100;
    if (percent > threshold) {
        return { type: 'caps', details: `${Math.round(percent)}% caps`, channelId: message.channel.id };
    }
    return null;
}