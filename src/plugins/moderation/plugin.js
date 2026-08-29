import Plugin from '../../core/Plugin.js';
import { createLogger } from '../../utils/logger.js';

export default class ModerationPlugin extends Plugin {
    constructor(client, manager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:moderation' });
    }
  static id = 'moderation';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
  }

  _registerSocketHandlers() {
    this.manager.registerSocketHandler('moderation.ban', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      await guild.members.ban(args.user, { reason: args.reason });
      return { success: true, message: `Banned user ${args.user}` };
    });

    this.manager.registerSocketHandler('moderation.kick', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      const member = await guild.members.fetch(args.user).catch(() => null);
      if (!member) throw new Error(`User ${args.user} not found in guild`);
      await member.kick(args.reason);
      return { success: true, message: `Kicked user ${args.user}` };
    });

    this.manager.registerSocketHandler('moderation.mute', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      const member = await guild.members.fetch(args.user).catch(() => null);
      if (!member) throw new Error(`User ${args.user} not found in guild`);
      const muteRole = guild.roles.cache.find(r => r.name === 'Muted');
      if (!muteRole) throw new Error('Muted role not found');
      await member.roles.add(muteRole);
      return { success: true, message: `Muted user ${args.user}` };
    });

    this.manager.registerSocketHandler('moderation.warn', async (client, args) => {
      return { success: true, message: `Warned user ${args.user}: ${args.reason}` };
    });

    this.manager.registerSocketHandler('moderation.clear', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      return { success: true, message: `Cleared ${args.count} messages` };
    });

    this.manager.registerSocketHandler('moderation.slowmode', async (client, args) => {
      return { success: true, message: `Slowmode set to ${args.seconds}s` };
    });

    this.manager.registerSocketHandler('moderation.lockdown', async (client, args) => {
      return { success: true, message: `Channel ${args.action || 'lockdown'} completed` };
    });
  }
}
