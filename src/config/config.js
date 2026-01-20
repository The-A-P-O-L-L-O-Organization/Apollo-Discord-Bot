// Bot Configuration
// This file contains all configurable settings for the Discord bot

export const config = {
    // Discord Bot Token - Get from https://discord.com/developers/applications
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'your-token-here',
    
    // Discord Client ID - Get from https://discord.com/developers/applications
    CLIENT_ID: process.env.CLIENT_ID || '',
    
    // Bot Activity/Status
    activity: {
        name: 'for new members join',
        type: 'WATCHING'
    },
    
    // Welcome Message Settings
    welcome: {
        // Channel name where welcome messages will be sent
        // The bot will look for a channel with this name
        channelName: 'welcome',
        
        // Welcome message template
        message: 'Welcome {user} to {server}! [SUCCESS]\n\n' +
                'We\'re glad to have you here!\n' +
                'Feel free to introduce yourself in #introductions.\n\n' +
                'Enjoy your stay!'
    },
    
    // Moderation Settings
    moderation: {
        // Default reason for moderation actions
        defaultReason: 'No reason provided',
        
        // Mute role configuration
        muteRoleName: 'Muted',
        muteDuration: 3600000, // 1 hour in milliseconds
        
        // Purge settings
        maxMessagesPerPurge: 100,
        purgeCooldown: 5000, // 5 seconds between purges
        
        // Action logging
        logModerationActions: true,
        moderationLogChannel: 'mod-logs'
    },
    
    // Warning System Settings (defaults, can be overridden per-server)
    warnings: {
        // Auto-punishment thresholds
        thresholds: {
            mute: 3,      // Auto-mute at 3 warnings
            kick: 5,      // Auto-kick at 5 warnings
            ban: 7        // Auto-ban at 7 warnings
        },
        // Duration for auto-mute punishment (in milliseconds)
        muteDuration: 3600000, // 1 hour
        // Whether to DM users when warned
        dmOnWarn: true
    },
    
    // Auto-moderation Default Settings (can be configured per-server)
    automod: {
        // Whether automod is enabled by default
        enabled: false,
        // List of banned words (servers should configure their own)
        bannedWords: [],
        // Maximum mentions allowed in a single message
        maxMentions: 5,
        // Maximum percentage of caps allowed (0-100)
        maxCapsPercent: 70,
        // Minimum message length to check for caps
        minCapsLength: 10,
        // Minimum account age in days (0 to disable)
        minAccountAge: 0,
        // Filter Discord invite links
        filterInvites: true,
        // Filter external links
        filterLinks: false,
        // Spam detection: max messages in interval
        spamThreshold: 5,
        // Spam detection: time interval in milliseconds
        spamInterval: 5000,
        // Action to take: 'warn', 'mute', 'kick', 'delete'
        action: 'warn'
    },
    
    // Ticket System Settings
    tickets: {
        // Default category name for ticket channels
        categoryName: 'Support Tickets',
        // Naming format for ticket channels
        channelPrefix: 'ticket-',
        // Welcome message in new tickets
        welcomeMessage: 'Thank you for creating a ticket! Support will be with you shortly.\n\nPlease describe your issue in detail.'
    },
    
    // Logging Settings
    logging: {
        // Events that can be logged
        availableEvents: [
            'messageDelete',
            'messageEdit', 
            'memberJoin',
            'memberLeave',
            'roleChanges',
            'voiceChanges'
        ],
        // Default events to enable
        defaultEvents: {
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            roleChanges: true,
            voiceChanges: false
        }
    },
    
    // Reminder Settings
    reminders: {
        // Check interval in milliseconds
        checkInterval: 30000, // 30 seconds
        // Maximum reminder duration (30 days)
        maxDuration: 30 * 24 * 60 * 60 * 1000
    },
    
    // Poll Settings
    polls: {
        // Default poll duration in milliseconds (24 hours)
        defaultDuration: 24 * 60 * 60 * 1000,
        // Maximum poll duration (7 days)
        maxDuration: 7 * 24 * 60 * 60 * 1000,
        // Maximum number of options
        maxOptions: 10
    },
    
    // Reaction Roles Settings
    reactionRoles: {
        // Whether to DM users when they get a role
        dmOnRole: false
    },
    
    // Command Prefix (for legacy commands if needed)
    prefix: '!'
};
