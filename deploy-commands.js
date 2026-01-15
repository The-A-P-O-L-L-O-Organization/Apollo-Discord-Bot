// Deploy Commands Script
// Registers slash commands with Discord for immediate use in a specific guild

import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { config } from './src/config/config.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create a temporary client just to get commands
const commands = [];

async function loadCommands() {
    const commandsPath = join(__dirname, 'src/commands');
    
    try {
        const commandFiles = readdirSync(commandsPath).filter(
            file => file.endsWith('.js')
        );
        
        console.log(`[INFO] Found ${commandFiles.length} command(s) to deploy...`);
        
        for (const file of commandFiles) {
            const filePath = join(commandsPath, file);
            const command = await import(`file://${filePath}`);
            
            if (command.default && command.default.name) {
                // Prepare command data for Discord
                const commandData = {
                    name: command.default.name,
                    description: command.default.description,
                    type: command.default.type,
                    options: command.default.options || []
                };
                
                commands.push(commandData);
                console.log(`[SUCCESS] Command prepared: /${command.default.name}`);
            }
        }
        
        console.log(`[SUCCESS] All commands loaded! Total: ${commands.length}`);
        
    } catch (error) {
        console.error('[ERROR] Error loading commands:', error);
        process.exit(1);
    }
}

async function deployCommands() {
    // Check if token is set
    if (config.DISCORD_TOKEN === 'your-token-here') {
        console.log('[ERROR] Please set your Discord bot token in .env file first!');
        console.log('[HINT] Copy .env.example to .env and add your token');
        process.exit(1);
    }
    
    // Create REST API instance
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    
    try {
        console.log('[INFO] Starting command deployment...');
        
        // Method 1: Deploy to a specific guild (immediate effect)
        // Uncomment the following lines and replace GUILD_ID with your server ID
        // await rest.put(
        //     Routes.applicationGuildCommands(config.CLIENT_ID || 'your-bot-id', 'GUILD_ID'),
        //     { body: commands }
        // );
        // console.log('[SUCCESS] Commands deployed to guild successfully!');
        
        // Method 2: Deploy globally (takes up to 1 hour)
        await rest.put(
            Routes.applicationCommands(config.CLIENT_ID || 'your-bot-id'),
            { body: commands }
        );
        console.log('[SUCCESS] Commands deployed globally successfully!');
        console.log('[WARNING] Global commands may take up to 1 hour to appear in all servers');
        
        console.log('\n[INFO] Deployed Commands:');
        commands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
        });
        
    } catch (error) {
        console.error('[ERROR] Error deploying commands:', error);
        process.exit(1);
    }
}

// Main execution
(async () => {
    console.log('Discord Bot - Command Deployment');
    console.log('===================================\n');
    
    await loadCommands();
    await deployCommands();
    
    console.log('\n[SUCCESS] Deployment complete!');
    process.exit(0);
})();
