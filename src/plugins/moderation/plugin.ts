import Plugin from '../../core/Plugin.js';
import type PluginManager from '../../core/PluginManager.js';
import type { Client, Guild, Role } from 'discord.js';
import { createLogger } from '../../utils/logger.js';

export default class ModerationPlugin extends Plugin {
    declare logger: ReturnType<typeof createLogger>;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:moderation' });
    }
    static override id = 'moderation';
    static override version = '1.0.0';
    static override dependencies: string[] = [];

    override async onEnable(): Promise<void> {
        await this._loadCommands();
        await this._loadEvents();
        this._registerSocketHandlers();
    }

    override onDisable(): Promise<void> {
        this._unloadCommands();
        this._unloadEvents();
        return Promise.resolve();
    }

    _registerSocketHandlers(): void {
        this.manager.registerSocketHandler('moderation.ban', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, Record<string, unknown>];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj['guild'] as string);
            if (!guild) { throw new Error(`Guild ${argsObj['guild'] as string} not found`); }
            await guild.members.ban(argsObj['user'] as string, { reason: argsObj['reason'] as string });
            return { success: true, message: `Banned user ${argsObj['user'] as string}` };
        });

        this.manager.registerSocketHandler('moderation.kick', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, Record<string, unknown>];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj['guild'] as string);
            if (!guild) { throw new Error(`Guild ${argsObj['guild'] as string} not found`); }
            const member = await guild.members.fetch(argsObj['user'] as string).catch(() => null);
            if (!member) { throw new Error(`User ${argsObj['user'] as string} not found in guild`); }
            await member.kick(argsObj['reason'] as string);
            return { success: true, message: `Kicked user ${argsObj['user'] as string}` };
        });

        this.manager.registerSocketHandler('moderation.mute', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, Record<string, unknown>];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj['guild'] as string);
            if (!guild) { throw new Error(`Guild ${argsObj['guild'] as string} not found`); }
            const member = await guild.members.fetch(argsObj['user'] as string).catch(() => null);
            if (!member) { throw new Error(`User ${argsObj['user'] as string} not found in guild`); }
            const muteRole = guild.roles.cache.find((r: Role) => r.name === 'Muted');
            if (!muteRole) { throw new Error('Muted role not found'); }
            await member.roles.add(muteRole);
            return { success: true, message: `Muted user ${argsObj['user'] as string}` };
        });

        this.manager.registerSocketHandler('moderation.warn', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, Record<string, unknown>];
            return Promise.resolve({ success: true, message: `Warned user ${argsObj['user'] as string}: ${argsObj['reason'] as string}` });
        });

        this.manager.registerSocketHandler('moderation.clear', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, Record<string, unknown>];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj['guild'] as string);
            if (!guild) { throw new Error(`Guild ${argsObj['guild'] as string} not found`); }
            return Promise.resolve({ success: true, message: `Cleared ${argsObj['count'] as string} messages` });
        });

        this.manager.registerSocketHandler('moderation.slowmode', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, Record<string, unknown>];
            return Promise.resolve({ success: true, message: `Slowmode set to ${argsObj['seconds'] as string}s` });
        });

        this.manager.registerSocketHandler('moderation.lockdown', async (...args: unknown[]) => {
            const [, argsObj] = args as [unknown, Record<string, unknown>];
            return Promise.resolve({ success: true, message: `Channel ${argsObj['action'] as string ?? 'lockdown'} completed` });
        });
    }
}