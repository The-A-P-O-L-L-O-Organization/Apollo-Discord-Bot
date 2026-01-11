// Command Handler
// Registers and manages all bot commands

import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function commandHandler(client) {
    const commandsPath = path.join(__dirname, '../commands');
    
    try {
        // Read all command files
        const commandFiles = readdirSync(commandsPath).filter(
            file => file.endsWith('.js')
        );
        
        console.log(`[INFO] Loading ${commandFiles.length} command(s)...`);
        
        // Load each command
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = await import(`file://${filePath}`);
            
            // Register command with client
            if (command.default && command.default.name) {
                client.commands.set(command.default.name, command.default);
                console.log(`[SUCCESS] Command loaded: /${command.default.name}`);
            }
        }
        
        console.log(`[SUCCESS] All commands loaded successfully!`);
        
        // Register commands with Discord (global commands)
        await registerCommands(client);
        
    } catch (error) {
        console.error(`[ERROR] Error loading commands:`, error);
    }
}

async function registerCommands(client) {
    try {
        // Get all command data
        const commands = Array.from(client.commands.values()).map(cmd => ({
            name: cmd.name,
            description: cmd.description,
            type: cmd.type,
            options: cmd.options || []
        }));
        
        // Register global commands
        // Note: Global commands can take up to 1 hour to update
        // For testing, you might want to use guild-specific commands
        const rest = client.rest;
        
        // For now, we'll just log that commands are ready
        console.log(`[INFO] ${commands.length} commands registered and ready`);
        console.log('[WARNING] Commands need to be registered with Discord');
        console.log('[HINT] Use client.rest.put(Routes.applicationGuildCommands(...)) for guild-specific commands');
        
    } catch (error) {
        console.error('[ERROR] Error registering commands:', error);
    }
}

