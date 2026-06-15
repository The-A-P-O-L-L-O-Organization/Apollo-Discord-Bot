import Plugin from '../../core/Plugin.js';
import { initReminderScheduler, stopReminderScheduler } from '../../utils/reminderScheduler.js';
import { initPollScheduler, stopPollScheduler } from '../../utils/pollScheduler.js';
import { initAnalyticsCollector, stopAnalyticsCollector } from '../../utils/analyticsCollector.js';
import DeepLService from '../../utils/deepl.js';

export default class UtilityPlugin extends Plugin {
  static id = 'utility';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    this._registerSocketHandlers();
    await initReminderScheduler(this.client);
    await initPollScheduler(this.client);
    initAnalyticsCollector(this.client);

  try {
    const deepLService = new DeepLService();
    await deepLService.initialize();
    global.deepLService = deepLService;
    console.log('[Utility] DeepL service initialized');
  } catch (error) {
    console.warn('[Utility] DeepL service not available:', error.message);
  }
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

    this.manager.registerSocketHandler('utility.embed', async (client, args) => {
      const { EmbedBuilder } = await import('discord.js');
      const { parseMarkdownToEmbed } = await import('../../../utils/markdownParser.js');
      const { readFileSync } = await import('fs');

      const channel = client.channels.cache.get(args.channel);
      if (!channel) throw new Error(`Channel ${args.channel} not found`);
      if (!channel.isTextBased()) throw new Error(`Channel ${args.channel} is not a text channel`);

      const embed = new EmbedBuilder();

      let parsed = {};
      if (args.file) {
        let content;
        try {
          content = readFileSync(args.file, 'utf-8');
        } catch {
          throw new Error(`Could not read file: ${args.file}`);
        }
        if (!content.trim()) throw new Error('The file is empty');
        parsed = parseMarkdownToEmbed(content, args.file, {
          title: args.title,
          description: args.description,
        });
      }

      if (parsed.title && !args.title) embed.setTitle(parsed.title);
      else if (args.title) embed.setTitle(args.title);

      if (parsed.description && !args.description) embed.setDescription(parsed.description);
      else if (args.description) embed.setDescription(args.description);

      if (args.color) {
        const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
        const match = args.color.match(hexRegex);
        if (match) embed.setColor(`#${match[1]}`);
        else throw new Error('Invalid hex color format');
      } else {
        embed.setColor('#3498DB');
      }

      if (args.image) embed.setImage(args.image);
      if (args.thumbnail) embed.setThumbnail(args.thumbnail);
      if (args.footer) embed.setFooter({ text: args.footer });
      else if (parsed.footer) embed.setFooter(parsed.footer);
      if (args.author) embed.setAuthor({ name: args.author });
      if (args.url) embed.setURL(args.url);
      if (args.timestamp === 'true' || args.timestamp === true) embed.setTimestamp();

      if (parsed.fields) {
        for (const field of parsed.fields) {
          embed.addFields(field);
        }
      }

      try {
        await channel.send({ embeds: [embed] });
        return { success: true, message: 'Embed sent successfully' };
      } catch (err) {
        throw new Error(`Failed to send embed: ${err.message}`);
      }
    });
  }
}
