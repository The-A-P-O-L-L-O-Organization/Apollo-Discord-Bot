import { logger } from '../utils/logger.js';
import type { Client, Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';
import type { GlobalConfig } from '../db/schemas.js';

let client: Client | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;

interface PerformanceStats {
    checksPerformed: number;
    pollsTallied: number;
    totalCheckTime: number;
    lastCheckTime: number;
    errors: number;
}

const performanceStats: PerformanceStats = {
    checksPerformed: 0,
    pollsTallied: 0,
    totalCheckTime: 0,
    lastCheckTime: 0,
    errors: 0
};

// Emoji options for polls (must match poll.js)
const POLL_EMOJIS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

interface PollOption {
    option: string;
    emoji: string;
    count: number;
}

interface PollData {
    id: string;
    question: string;
    options: string[];
    channelId: string;
    messageId: string;
    endTime: number;
}

interface GuildPollData {
    active: PollData[];
}

/**
 * Loads polls from database and populates in-memory cache
 */
async function loadPollsFromDatabase(): Promise<void> {
    try {
        const data = await getData('polls');
        if (data && typeof data === 'object') {
            const totalPolls = Object.values(data).reduce((sum: number, guildData: unknown) => {
                const active = (guildData as { active?: unknown[] } | null)?.active;
                return sum + (active ? active.length : 0);
            }, 0);
            logger.info({ msg: `[INFO] Loaded ${totalPolls} polls from database` });
        }
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Failed to load polls from database' });
    }
}

/**
 * Initializes the poll scheduler
 * @param discordClient - The Discord client instance
 */
export async function initPollScheduler(discordClient: Client): Promise<void> {
    client = discordClient;

    // Load polls from database on startup
    await loadPollsFromDatabase();

    schedulerInterval = setInterval(() => { void (async () => {
        const redis = await getLockRedis();
        if (redis) {
            // TTL = interval (30s) to ensure no gap between lock expiration and next acquisition
            await withLock(redis, 'scheduler:polls', config.podId ?? 'default', checkPolls, 30000);
        } else {
            await checkPolls();
        }
    })(); }, 30000);

    logger.info({ msg: '[INFO] Poll scheduler started (checking every 30s)' });

    // Run an immediate check
    checkPolls().catch(err => logger.error({ err: err as Error, msg: '[ERROR] Poll check failed' }));
}

/**
 * Stops the poll scheduler
 */
export function stopPollScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info({ msg: '[INFO] Poll scheduler stopped' });
    }
}

/**
 * Requeues a poll whose tally failed so a later tick retries it
 * @param guildId - The guild ID
 * @param poll - The poll object
 */
async function requeuePoll(guildId: string, poll: PollData): Promise<void> {
    try {
        const data = await getData('polls') as unknown as Record<string, GuildPollData> | null;
        const guildData = data?.[guildId];
        if (!guildData) { return; }
        guildData.active ??= [];
        const exists = guildData.active.some(p => p.id === poll.id);
        if (!exists) {
            guildData.active.push(poll);
            await setData('polls', data as unknown as GlobalConfig);
        }
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Failed to requeue poll' });
    }
}

/**
 * Checks for expired polls and tallies them
 * @param clientOverride - Optional client for testing
 */
export async function checkPolls(clientOverride?: Client): Promise<void> {
    const activeClient = clientOverride ?? client;
    if (!activeClient) {return;}

    const startTime = Date.now();

    try {
        const data = await getData('polls');
        if (!data) {
            performanceStats.checksPerformed++;
            performanceStats.lastCheckTime = Date.now() - startTime;
            performanceStats.totalCheckTime += performanceStats.lastCheckTime;
            return;
        }

        const now = Date.now();
        const claimed: { guildId: string; poll: PollData }[] = [];

        for (const [guildId, guildData] of Object.entries(data as Record<string, GuildPollData>)) {
            if (!guildData.active || guildData.active.length === 0) {continue;}

            const expiredPolls = guildData.active.filter(p => p.endTime <= now);
            if (expiredPolls.length === 0) {continue;}

            guildData.active = guildData.active.filter(p => p.endTime > now);
            for (const poll of expiredPolls) {
                claimed.push({ guildId, poll });
            }
        }

        if (claimed.length === 0) {
            performanceStats.checksPerformed++;
            performanceStats.lastCheckTime = Date.now() - startTime;
            performanceStats.totalCheckTime += performanceStats.lastCheckTime;
            return;
        }

        await setData('polls', data);

        let tallyCount = 0;
        for (const { guildId, poll } of claimed) {
            const ok = await tallyPoll(activeClient, guildId, poll);
            if (ok) {
                tallyCount++;
            } else {
                await requeuePoll(guildId, poll);
            }
        }

        // Update performance stats
        performanceStats.checksPerformed++;
        performanceStats.pollsTallied += tallyCount;
        performanceStats.lastCheckTime = Date.now() - startTime;
        performanceStats.totalCheckTime += performanceStats.lastCheckTime;

        if (tallyCount > 0) {
            logger.info({ msg: `[INFO] Tallied ${tallyCount} poll(s) in ${performanceStats.lastCheckTime}ms` });
        }

    } catch (error) {
        performanceStats.errors++;
        logger.error({ err: error as Error, msg: '[ERROR] Poll scheduler error' });
    }
}

/**
 * Tallies a poll and posts results
 * @param activeClient - The Discord client instance
 * @param guildId - The guild ID
 * @param poll - The poll object
 * @returns Whether the poll was fully handled
 */
async function tallyPoll(activeClient: Client, guildId: string, poll: PollData): Promise<boolean> {
    try {
        // Fetch the guild
        const guild = await activeClient.guilds.fetch(guildId).catch(() => null);
        if (!guild) {return true;}

        // Fetch the channel
        const channel = await guild.channels.fetch(poll.channelId).catch(() => null);
        if (!channel?.isTextBased()) {return true;}

        // Fetch the poll message
        let message: Message;
        try {
            message = await channel.messages.fetch(poll.messageId);
        } catch {
            logger.info({ msg: `[INFO] Poll message ${poll.messageId} not found, skipping tally` });
            return true;
        }

        // Count reactions
        const results: PollOption[] = [];
        for (let i = 0; i < poll.options.length; i++) {
            const emoji = POLL_EMOJIS[i] ?? '';
            const reaction = message.reactions.cache.get(emoji);
            // Subtract 1 for the bot's reaction
            const count = reaction ? Math.max(0, reaction.count - 1) : 0;
            results.push({
                option: poll.options[i] ?? '',
                emoji,
                count
            });
        }

        // Calculate total votes
        const totalVotes = results.reduce((sum, r) => sum + r.count, 0);

        // Sort by vote count (descending)
        const sortedResults = [...results].sort((a, b) => b.count - a.count);

        // Build results embed
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('[Poll] Results: ' + poll.question)
            .setTimestamp()
            .setFooter({ text: `Poll ended • Total votes: ${totalVotes}` });

        // Build results string
        let resultsText = '';
        for (const result of sortedResults) {
            const percentage = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
            const bar = generateProgressBar(percentage);
            resultsText += `${result.emoji} **${result.option}**\n${bar} ${result.count} votes (${percentage}%)\n\n`;
        }

        embed.setDescription(resultsText);

        // Determine winner(s)
        if (totalVotes > 0 && sortedResults.length > 0) {
            const maxVotes = sortedResults[0]!.count;
            const winners = sortedResults.filter(r => r.count === maxVotes);

            if (winners.length === 1) {
                embed.addFields({
                    name: 'Winner',
                    value: `${winners[0]!.emoji} **${winners[0]!.option}** with ${winners[0]!.count} votes`,
                    inline: false
                });
            } else if (winners.length > 1) {
                const winnerText = winners.map(w => `${w.emoji} ${w.option}`).join('\n');
                embed.addFields({
                    name: 'Tie!',
                    value: winnerText,
                    inline: false
                });
            }
        } else {
            embed.addFields({
                name: 'Result',
                value: 'No votes were cast.',
                inline: false
            });
        }

        // Send results
        await channel.send({ embeds: [embed] });

        // Try to edit the original poll message to show it's closed
        try {
            const originalEmbed = message.embeds[0];
            if (originalEmbed?.fields) {
                const closedEmbed = EmbedBuilder.from(originalEmbed)
                    .setColor('#7F8C8D')
                    .setFooter({ text: 'Poll ended' });

                await message.edit({ embeds: [closedEmbed], components: [] });
            }
        } catch {
            logger.info({ msg: '[INFO] Failed to send poll results' });
        }

        return true;

    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to tally poll ${poll.id}` });
        return false;
    }
}

/**
 * Generates a progress bar string
 * @param percentage - The percentage (0-100)
 * @returns Progress bar string
 */
function generateProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Gets performance statistics for the poll scheduler
 * @returns Performance stats
 */
export function getPollSchedulerStats(): PerformanceStats & { averageCheckTime: number; uptime: number } {
    const avgCheckTime = performanceStats.checksPerformed > 0
        ? performanceStats.totalCheckTime / performanceStats.checksPerformed
        : 0;

    return {
        ...performanceStats,
        averageCheckTime: Math.round(avgCheckTime),
        uptime: schedulerInterval ? Date.now() - (performanceStats.checksPerformed * 30000) : 0
    };
}