import Plugin from '../../core/Plugin.js';
import PluginManager from '../../core/PluginManager.js';
import { createLogger } from '../../utils/logger.js';
import type { Client } from 'discord.js';

export default class AutomodPlugin extends Plugin {
    declare logger: ReturnType<typeof createLogger>;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:automod' });
    }
    static override id = 'automod';
    static override version = '1.0.0';
    static override dependencies = [];
    
    // TensorFlow needs more memory
    static resourceLimits = {
        maxOldGenerationSizeMb: 512,
        maxYoungGenerationSizeMb: 128,
        stackSizeMb: 16
    };

    override async onEnable() {
        await this._loadCommands();
        await this._loadEvents();
    }

    override async onDisable() {
        this._unloadCommands();
        this._unloadEvents();
    }
}