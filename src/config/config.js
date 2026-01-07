// Bot Configuration
// This file contains all configurable settings for the Discord bot

export const config = {
    // Discord Bot Token - Get from https://discord.com/developers/applications
    DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'your-token-here',
    
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
        message: 'Welcome {user} to {server}! 🎉\n\n' +
                'We\'re glad to have you here!\n' +
                'Feel free to introduce yourself in #introductions.\n\n' +
                'Enjoy your stay! 👋'
    },
    
    // Command Prefix (if you want to add commands later)
    prefix: '!'
};

