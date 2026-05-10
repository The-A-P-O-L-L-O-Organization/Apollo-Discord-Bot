// Deploy Commands Script
// Registers slash commands with Discord for immediate use in a specific guild

import 'dotenv/config';
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
    const pluginsDir = join(__dirname, 'src/plugins');
    
    try {
        const pluginDirs = readdirSync(pluginsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
        
        let totalFound = 0;
        
        for (const plugin of pluginDirs) {
            const commandsPath = join(pluginsDir, plugin, 'commands');
            try {
                const commandFiles = readdirSync(commandsPath).filter(
                    file => file.endsWith('.js')
                );
                
                for (const file of commandFiles) {
                    const filePath = join(commandsPath, file);
                    const command = await import(`file://${filePath}`);
                    
                    if (command.default) {
                        let commandData;
                        if (command.default.data) {
                            commandData = command.default.data.toJSON();
                        } else if (command.default.name) {
                            commandData = {
                                name: command.default.name,
                                description: command.default.description || 'No description',
                                type: command.default.type || 1,
                                options: command.default.options || []
                            };
                        } else {
                            continue;
                        }
                        commands.push(commandData);
                        console.log(`[${plugin}] /${commandData.name}`);
                    }
                }
                totalFound += commandFiles.length;
            } catch {
                // No commands directory for this plugin, skip
            }
        }
        
        console.log(`\n[SUCCESS] Total: ${commands.length} commands from ${pluginDirs.length} plugins`);
        
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
    
    // Check if CLIENT_ID is set
    if (!config.CLIENT_ID || config.CLIENT_ID === 'your-bot-id') {
        console.error('Error: CLIENT_ID is not configured. Please set it in your .env file.');
        process.exit(1);
    }
    
    // Create REST API instance
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
    
    try {
        console.log('[INFO] Starting command deployment...');
        
        // Check if GUILD_ID is set for development deployment
        if (config.GUILD_ID) {
            console.log('[INFO] Deploying to specific guild (development mode)...');
            await rest.put(
                Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
                { body: commands }
            );
            console.log(`[SUCCESS] Commands deployed to guild ${config.GUILD_ID} successfully!`);
            console.log('[INFO] Commands will appear instantly in the specified server');
        } else {
            console.log('[INFO] Deploying globally (production mode)...');
            await rest.put(
                Routes.applicationCommands(config.CLIENT_ID),
                { body: commands }
            );
            console.log('[SUCCESS] Commands deployed globally successfully!');
            console.log('[INFO] Global commands may take up to 1 hour to appear in all servers');
        }
        
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
