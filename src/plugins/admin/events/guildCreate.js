// Guild Create Event
// Triggered when the bot joins a new server
// Initializes default settings for the guild
import { logger } from './utils/logger.js';

import { setGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';

export default {
import { logger } from '../../../utils/logger.js';
    name: 'guildCreate',
    once: false,
    async execute(guild, client) {
        try {
            logger.info(`[SUCCESS] Bot joined new server: ${guild.name} (${guild.id})`);
            logger.info(`[INFO] Server has ${guild.memberCount} members`);
            
            // Initialize default automod settings
            const automodDefaults = {
                enabled: config.automod.enabled,
                bannedWords: [...config.automod.bannedWords],
                filterInvites: config.automod.filterInvites,
                filterLinks: config.automod.filterLinks,
                maxMentions: config.automod.maxMentions,
                maxCapsPercent: config.automod.maxCapsPercent,
                minAccountAge: config.automod.minAccountAge,
                spamThreshold: config.automod.spamThreshold,
                spamInterval: config.automod.spamInterval,
                exemptChannels: [],
                exemptRoles: []
            };
            
            await setGuildData('automod', guild.id, automodDefaults);
            logger.info('[SUCCESS] Initialized automod settings');
            
            // Initialize default logging settings
            const loggingDefaults = {
                channelId: null, // Will be set when user runs /setlogchannel
                events: { ...config.logging.defaultEvents }
            };
            
            await setGuildData('logging', guild.id, loggingDefaults);
            logger.info('[SUCCESS] Initialized logging settings');
            
            // Initialize warning system settings
            const warningDefaults = {
                thresholds: { ...config.warnings.thresholds },
                muteDuration: config.warnings.muteDuration
            };
            
            await setGuildData('warnings-config', guild.id, warningDefaults);
            logger.info('[SUCCESS] Initialized warning settings');
            
            // Initialize empty blacklist
            await setGuildData('blacklist', guild.id, { entries: {} });
            logger.info('[SUCCESS] Initialized blacklist');
            
            // Initialize empty reaction roles
            await setGuildData('reactionroles', guild.id, { roles: [] });
            logger.info('[SUCCESS] Initialized reaction roles');
            
            // Initialize empty ticket system
            await setGuildData('tickets', guild.id, {
                categoryId: null,
                supportRoleId: null,
                panelMessageId: null,
                panelChannelId: null,
                openTickets: [],
                totalTickets: 0
            });
            logger.info('[SUCCESS] Initialized ticket system');
            
            // Initialize empty polls storage
            await setGuildData('polls', guild.id, { active: [] });
            logger.info('[SUCCESS] Initialized polls');
            
            logger.info(`[SUCCESS] Completed initialization for ${guild.name}`);
            
            // Try to send a welcome message to the system channel or first available text channel
            try {
                const welcomeChannel = guild.systemChannel || 
                                      guild.channels.cache.find(ch => 
                                          ch.isTextBased() && 
                                          ch.permissionsFor(guild.members.me).has('SendMessages')
                                      );
                
                if (welcomeChannel) {
                    const embed = {
                        color: 0x3498DB, // Blue
                        title: '[SUCCESS] Thanks for adding A.P.O.L.L.O!',
                        description: 'Hello! I\'m A.P.O.L.L.O, your new Discord moderation and utility bot.',
                        fields: [
                            {
                                name: '[INFO] Getting Started',
                                value: 'Use `/help` to see all available commands.',
                                inline: false
                            },
                            {
                                name: '[INFO] Setup Commands',
                                value: '• `/setlogchannel` - Set up moderation logging\n' +
                                       '• `/automod` - Configure auto-moderation\n' +
                                       '• `/warnconfig` - Configure warning thresholds\n' +
                                       '• `/ticketsetup` - Set up support tickets',
                                inline: false
                            },
                            {
                                name: '[INFO] Support',
                                value: 'Need help? Check the bot\'s documentation or contact support.',
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Now serving ${client.guilds.cache.size} servers!`
                        }
                    };
                    
                    await welcomeChannel.send({ embeds: [embed] });
                    logger.info('[SUCCESS] Sent welcome message to server');
                }
            } catch (welcomeError) {
                logger.info('[WARNING] Could not send welcome message:', welcomeError.message);
            }
            
        } catch (error) {
            logger.error('[ERROR] guildCreate event error:', error);
        }
    }
};
