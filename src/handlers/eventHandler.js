// Event Handler
// Dynamically loads and registers all event files

import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function eventHandler(client) {
    const eventsPath = path.join(__dirname, '../events');
    
    try {
        // Read all event files
        const eventFiles = readdirSync(eventsPath).filter(
            file => file.endsWith('.js')
        );
        
        console.log(`[INFO] Loading ${eventFiles.length} event(s)...`);
        
        // Load each event
        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = await import(`file://${filePath}`);
            
            // Get event configuration
            const eventModule = event.default;
            
            if (!eventModule) {
                console.log(`[WARNING] Event file ${file} has no default export, skipping...`);
                continue;
            }
            
            // Handle different event export formats
            if (typeof eventModule === 'function') {
                // Legacy format: export default function(client) {}
                // Skip these - they're handled differently (ready, guildMemberAdd)
                continue;
            }
            
            if (eventModule.name && eventModule.execute) {
                // New format: { name, once?, execute }
                const eventName = eventModule.name;
                const once = eventModule.once || false;
                
                if (once) {
                    client.once(eventName, (...args) => eventModule.execute(...args, client));
                } else {
                    client.on(eventName, (...args) => eventModule.execute(...args, client));
                }
                
                console.log(`[SUCCESS] Event loaded: ${eventName}${once ? ' (once)' : ''}`);
            }
        }
        
        console.log(`[SUCCESS] All events loaded successfully!`);
        
    } catch (error) {
        console.error(`[ERROR] Error loading events:`, error);
    }
}
