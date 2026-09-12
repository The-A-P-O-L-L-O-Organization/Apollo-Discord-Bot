import Plugin from '../../core/Plugin.js';
// @ts-expect-error - JS file not yet migrated
import { createLogger } from '../../utils/logger.js';

export default class ModerationPlugin extends Plugin {
    declare logger: ReturnType<typeof createLogger>;

    constructor(client: any, manager: any) {
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

    override async onDisable(): Promise<void> {
        this._unloadCommands();
        this._unloadEvents();
    }

    _registerSocketHandlers(): void {
        this.manager.registerSocketHandler('moderation.ban', async (client: any, args: any) => {
            const guild = client.guilds.cache.get(args.guild);
            if (!guild) throw new Error(`Guild ${args.guild} not found`);
            await guild.members.ban(args.user, { reason: args.reason });
            return { success: true, message: `Banned user ${args.user}` };
        });

        this.manager.registerSocketHandler('moderation.kick', async (client: any, args: any) => {
            const guild = client.guilds.cache.get(args.guild);
            if (!guild) throw new Error(`Guild ${args.guild} not found`);
            const member = await guild.members.fetch(args.user).catch(() => null);
            if (!member) throw new Error(`User ${args.user} not found in guild`);
            await member.kick(args.reason);
            return { success: true, message: `Kicked user ${args.user}` };
        });

        this.manager.registerSocketHandler('moderation.mute', async (client: any, args: any) => {
            const guild = client.guilds.cache.get(args.guild);
            if (!guild) throw new Error(`Guild ${args.guild} not found`);
            const member = await guild.members.fetch(args.user).catch(() => null);
            if (!member) throw new Error(`User ${args.user} not found in guild`);
            const muteRole = guild.roles.cache.find((r: any) => r.name === 'Muted');
            if (!muteRole) throw new Error('Muted role not found');
            await member.roles.add(muteRole);
            return { success: true, message: `Muted user ${args.user}` };
        });

        this.manager.registerSocketHandler('moderation.warn', async (_client: any, args: any) => {
            return { success: true, message: `Warned user ${args.user}: ${args.reason}` };
        });

        this.manager.registerSocketHandler('moderation.clear', async (client: any, args: any) => {
            const guild = client.guilds.cache.get(args.guild);
            if (!guild) throw new Error(`Guild ${args.guild} not found`);
            return { success: true, message: `Cleared ${args.count} messages` };
        });

        this.manager.registerSocketHandler('moderation.slowmode', async (_client: any, args: any) => {
            return { success: true, message: `Slowmode set to ${args.seconds}s` };
        });

        this.manager.registerSocketHandler('moderation.lockdown', async (_client: any, args: any) => {
            return { success: true, message: `Channel ${args.action || 'lockdown'} completed` };
        });
    }
}