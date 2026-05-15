import Plugin from '../../core/Plugin.js';
import { initReminderScheduler, stopReminderScheduler } from '../../utils/reminderScheduler.js';
import { initPollScheduler, stopPollScheduler } from '../../utils/pollScheduler.js';
import { initAnalyticsCollector, stopAnalyticsCollector } from '../../utils/analyticsCollector.js';

export default class UtilityPlugin extends Plugin {
  static id = 'utility';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
    initReminderScheduler(this.client);
    initPollScheduler(this.client);
    initAnalyticsCollector(this.client);
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
    this._stopSchedulers();
    stopReminderScheduler();
    stopPollScheduler();
    stopAnalyticsCollector();
  }

  _registerSocketHandlers() {
    this.manager.registerSocketHandler('utility.serverinfo', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      return {
        name: guild.name,
        id: guild.id,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        createdAt: guild.createdAt?.toISOString(),
        channels: guild.channels.cache.size,
        roles: guild.roles.cache.size
      };
    });

    this.manager.registerSocketHandler('utility.userinfo', async (client, args) => {
      const guild = client.guilds.cache.get(args.guild);
      if (!guild) throw new Error(`Guild ${args.guild} not found`);
      const member = await guild.members.fetch(args.user).catch(() => null);
      if (!member) throw new Error(`User ${args.user} not found in guild`);
      return {
        id: member.id,
        tag: member.user.tag,
        nickname: member.nickname,
        joinedAt: member.joinedAt?.toISOString(),
        roles: member.roles.cache.map(r => r.name),
        permissions: member.permissions.toArray()
      };
    });

    this.manager.registerSocketHandler('utility.ping', async (client, args) => {
      return { ping: client.ws.ping, websocket: 'connected' };
    });
  }
}
