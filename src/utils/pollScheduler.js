// Poll Scheduler
// Background task that checks and tallies completed polls

import { EmbedBuilder } from 'discord.js';
import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';

let client = null;
let schedulerInterval = null;
const performanceStats = {
    checksPerformed: 0,
    pollsTallied: 0,
    totalCheckTime: 0,
    lastCheckTime: 0,
    errors: 0
};

// Emoji options for polls (must match poll.js)
const POLL_EMOJIS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

// In-memory cache of polls (used for performance tracking)

/**
 * Loads polls from database and populates in-memory cache
 */
async function loadPollsFromDatabase() {
    try {
        const data = await getData('polls');
        if (data && typeof data === 'object') {
            const totalPolls = Object.values(data).reduce((sum, guildData) => {
                return sum + (guildData.active ? guildData.active.length : 0);
            }, 0);
            console.log(`[INFO] Loaded ${totalPolls} polls from database`);
        }
    } catch (error) {
        console.error('[ERROR] Failed to load polls from database:', error);
    }
}

/**
 * Initializes the poll scheduler
 * @param {Client} discordClient - The Discord client instance
 */
export async function initPollScheduler(discordClient) {
    client = discordClient;
    
    // Load polls from database on startup
    await loadPollsFromDatabase();
    
    schedulerInterval = setInterval(async() => {
        const redis = await getLockRedis();
        if (redis) {
            await withLock(redis, 'scheduler:polls', config.podId, checkPolls, 25000);
        } else {
            await checkPolls();
        }
    }, 30000);
    
    console.log('[INFO] Poll scheduler started (checking every 30s)');
    
    // Run an immediate check
    checkPolls().catch(err => console.error('[ERROR] Poll check failed:', err));
}

/**
 * Stops the poll scheduler
 */
export function stopPollScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[INFO] Poll scheduler stopped');
    }
}

/**
 * Checks for expired polls and tallies them
 */
async function checkPolls() {
    if (!client) {return;}
    
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
        let tallyCount = 0;
        
        // Process each guild's polls
        for (const [guildId, guildData] of Object.entries(data)) {
            if (!guildData.active || guildData.active.length === 0) {continue;}
            
            const expiredPolls = guildData.active.filter(p => p.endTime <= now);
            
            for (const poll of expiredPolls) {
                await tallyPoll(guildId, poll);
                tallyCount++;
            }
            
            // Remove expired polls from active list
            guildData.active = guildData.active.filter(p => p.endTime > now);
        }
        
        // Update performance stats
        performanceStats.checksPerformed++;
        performanceStats.pollsTallied += tallyCount;
        performanceStats.lastCheckTime = Date.now() - startTime;
        performanceStats.totalCheckTime += performanceStats.lastCheckTime;
        
        if (tallyCount > 0) {
            await setData('polls', data);
            console.log(`[INFO] Tallied ${tallyCount} poll(s) in ${performanceStats.lastCheckTime}ms`);
        }
        
    } catch (error) {
        performanceStats.errors++;
        console.error('[ERROR] Poll scheduler error:', error);
    }
}

/**
 * Tallies a poll and posts results
 * @param {string} guildId - The guild ID
 * @param {Object} poll - The poll object
 */
async function tallyPoll(guildId, poll) {
    try {
        // Fetch the guild
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {return;}
        
        // Fetch the channel
        const channel = await guild.channels.fetch(poll.channelId);
        if (!channel || !channel.isTextBased()) {return;}
        
        // Fetch the poll message
        let message;
        try {
            message = await channel.messages.fetch(poll.messageId);
        } catch {
            console.log(`[INFO] Poll message ${poll.messageId} not found, skipping tally`);
            return;
        }
        
        // Count reactions
        const results = [];
        for (let i = 0; i < poll.options.length; i++) {
            const emoji = POLL_EMOJIS[i];
            const reaction = message.reactions.cache.get(emoji);
            // Subtract 1 for the bot's reaction
            const count = reaction ? Math.max(0, reaction.count - 1) : 0;
            results.push({
                option: poll.options[i],
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
        if (totalVotes > 0) {
            const maxVotes = sortedResults[0].count;
            const winners = sortedResults.filter(r => r.count === maxVotes);
            
            if (winners.length === 1) {
                embed.addFields({
                    name: 'Winner',
                    value: `${winners[0].emoji} **${winners[0].option}** with ${winners[0].count} votes`,
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
            if (originalEmbed && originalEmbed.fields) {
                const closedEmbed = EmbedBuilder.from(originalEmbed)
                    .setColor('#7F8C8D')
                    .setFooter({ text: 'Poll ended' });
                
                await message.edit({ embeds: [closedEmbed], components: [] });
            }
        } catch {
            console.log('[INFO] Failed to send poll results');
        }
        
    } catch (error) {
        console.error(`[ERROR] Failed to tally poll ${poll.id}:`, error);
    }
}

/**
 * Generates a progress bar string
 * @param {number} percentage - The percentage (0-100)
 * @returns {string} Progress bar string
 */
function generateProgressBar(percentage) {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Gets performance statistics for the poll scheduler
 * @returns {Object} Performance stats
 */
export function getPollSchedulerStats() {
    const avgCheckTime = performanceStats.checksPerformed > 0 
        ? performanceStats.totalCheckTime / performanceStats.checksPerformed 
        : 0;
    
    return {
        ...performanceStats,
        averageCheckTime: Math.round(avgCheckTime),
        uptime: schedulerInterval ? Date.now() - (performanceStats.checksPerformed * 30000) : 0
    };
}
