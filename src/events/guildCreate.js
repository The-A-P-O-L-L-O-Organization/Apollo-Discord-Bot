// Guild Create Event
// Triggered when the bot joins a new server
// Initializes default settings for the guild

import { setGuildData } from '../utils/db.js';
import { config } from '../config/config.js';

export default {
    name: 'guildCreate',
    once: false,
    async execute(guild, client) {
        try {
            console.log(`[SUCCESS] Bot joined new server: ${guild.name} (${guild.id})`);
            console.log(`[INFO] Server has ${guild.memberCount} members`);
            
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
            
            setGuildData('automod', guild.id, automodDefaults);
            console.log('[SUCCESS] Initialized automod settings');
            
            // Initialize default logging settings
            const loggingDefaults = {
                channelId: null, // Will be set when user runs /setlogchannel
                events: { ...config.logging.defaultEvents }
            };
            
            setGuildData('logging', guild.id, loggingDefaults);
            console.log('[SUCCESS] Initialized logging settings');
            
            // Initialize warning system settings
            const warningDefaults = {
                thresholds: { ...config.warnings.thresholds },
                muteDuration: config.warnings.muteDuration
            };
            
            setGuildData('warnings-config', guild.id, warningDefaults);
            console.log('[SUCCESS] Initialized warning settings');
            
            // Initialize empty blacklist
            setGuildData('blacklist', guild.id, { entries: {} });
            console.log('[SUCCESS] Initialized blacklist');
            
            // Initialize empty reaction roles
            setGuildData('reactionroles', guild.id, { roles: [] });
            console.log('[SUCCESS] Initialized reaction roles');
            
            // Initialize empty ticket system
            setGuildData('tickets', guild.id, {
                categoryId: null,
                supportRoleId: null,
                panelMessageId: null,
                panelChannelId: null,
                openTickets: [],
                totalTickets: 0
            });
            console.log('[SUCCESS] Initialized ticket system');
            
            // Initialize empty polls storage
            setGuildData('polls', guild.id, { active: [] });
            console.log('[SUCCESS] Initialized polls');
            
            console.log(`[SUCCESS] Completed initialization for ${guild.name}`);
            
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
                    console.log('[SUCCESS] Sent welcome message to server');
                }
            } catch (welcomeError) {
                console.log('[WARNING] Could not send welcome message:', welcomeError.message);
            }
            
        } catch (error) {
            console.error('[ERROR] guildCreate event error:', error);
        }
    }
};
