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
    
    // Command Prefix (if you want to add commands later)
    prefix: '!'
};

