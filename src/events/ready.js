// Ready Event Handler
// This event fires when the bot successfully connects to Discord

import { ActivityType } from 'discord.js';

export default async function readyHandler(client) {
    console.log(`[SUCCESS] Bot is online! Logged in as ${client.user.tag}`);
    console.log(`[INFO] Bot ID: ${client.user.id}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} server(s)`);
    
    // Set bot activity/status
    client.user.setActivity({
        name: 'for new members join',
        type: ActivityType.Watching
    });
    
    console.log('[SUCCESS] Bot is now watching for new members...');
}

