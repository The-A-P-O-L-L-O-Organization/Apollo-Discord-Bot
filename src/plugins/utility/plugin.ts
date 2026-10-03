import { Plugin } from '../../core/Plugin.js';
import type PluginManager from '../../core/PluginManager.js';
import type { Client, Guild, GuildChannel, TextChannel, NewsChannel } from 'discord.js';
import { initReminderScheduler, stopReminderScheduler } from '../../utils/reminderScheduler.js';
import { initPollScheduler, stopPollScheduler } from '../../utils/pollScheduler.js';
import { initAnalyticsCollector, stopAnalyticsCollector } from '../../utils/analyticsCollector.js';
import TranslationService from '../../utils/translation.js';
import { createLogger } from '../../utils/logger.js';
import type { ParsedMarkdown } from '../../utils/markdownParser.js';

export default class UtilityPlugin extends Plugin {
    public declare logger: ReturnType<typeof createLogger>;

    constructor(client: Client, manager: PluginManager) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:utility' });
    }

    static override get id() { return 'utility'; }
    static override readonly version = '1.0.0';
    static override readonly dependencies: string[] = [];

    override async onEnable() {
        await this._loadCommands();
        await this._loadEvents();
        this._registerSocketHandlers();
        await initReminderScheduler(this.client);
        await initPollScheduler(this.client);
        initAnalyticsCollector(this.client);

        try {
            const translationService = new TranslationService();
            await translationService.initialize();
            // @ts-expect-error - global extension
            global.translationService = translationService;
            this.logger.info('[Utility] Translation service initialized');
        } catch (error) {
            this.logger.warn('[Utility] Translation service not available: ' + (error as Error).message);
        }
    }

    override onDisable(): Promise<void> {
        this._unloadCommands();
        this._unloadEvents();
        this._stopSchedulers();
        stopReminderScheduler();
        stopPollScheduler();
        stopAnalyticsCollector();
        return Promise.resolve();
    }

    _registerSocketHandlers() {
        this.manager.registerSocketHandler('utility.serverinfo', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, { guild: string }];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj.guild);
            if (!guild) { throw new Error(`Guild ${argsObj.guild} not found`); }
            return Promise.resolve({
                name: guild.name,
                id: guild.id,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                createdAt: guild.createdAt?.toISOString(),
                channels: guild.channels.cache.size,
                roles: guild.roles.cache.size
            });
        });

        this.manager.registerSocketHandler('utility.userinfo', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, { guild: string; user: string }];
            const c = client as { guilds: { cache: Map<string, Guild> } };
            const guild = c.guilds.cache.get(argsObj.guild);
            if (!guild) { throw new Error(`Guild ${argsObj.guild} not found`); }
            const member = await guild.members.fetch(argsObj.user).catch(() => null);
            if (!member) { throw new Error(`User ${argsObj.user} not found in guild`); }
            return {
                id: member.id,
                tag: member.user.tag,
                nickname: member.nickname,
                joinedAt: member.joinedAt?.toISOString(),
                roles: member.roles.cache.map((r) => r.name),
                permissions: member.permissions.toArray()
            };
        });

        this.manager.registerSocketHandler('utility.ping', async (...args: unknown[]) => {
            const [client] = args as [unknown];
            const c = client as { ws: { ping: number } };
            return Promise.resolve({ ping: c.ws.ping, websocket: 'connected' });
        });

        this.manager.registerSocketHandler('utility.embed', async (...args: unknown[]) => {
            const [client, argsObj] = args as [unknown, {
                channel: string;
                file?: string;
                title?: string;
                description?: string;
                color?: string;
                image?: string;
                thumbnail?: string;
                footer?: string;
                author?: string;
                url?: string;
                timestamp?: string | boolean;
            }];
            const c = client as { channels: { cache: Map<string, GuildChannel> } };
            const channelId = argsObj.channel;
            const channel = c.channels.cache.get(channelId);
            if (!channel) { throw new Error(`Channel ${channelId} not found`); }
            if (!channel.isTextBased()) { throw new Error(`Channel ${channelId} is not a text channel`); }

            const { EmbedBuilder } = await import('discord.js');
            const { parseMarkdownToEmbed } = await import('../../utils/markdownParser.js');
            const fs = await import('fs');
            const path = await import('path');

            const embed = new EmbedBuilder();

            let parsed: ParsedMarkdown | Record<string, unknown> = {};
            if (argsObj.file) {
                const DATA_ROOT = path.resolve(process.cwd(), 'data');
                const targetPath = path.resolve(DATA_ROOT, argsObj.file);
                if (!targetPath.startsWith(DATA_ROOT + path.sep)) {
                    throw new Error('File path must be within the data directory.');
                }
                let content: string;
                try {
                    content = fs.readFileSync(targetPath, 'utf-8');
                } catch {
                    throw new Error(`Could not read file: ${argsObj.file}`);
                }
                if (!content.trim()) { throw new Error('The file is empty'); }
                parsed = parseMarkdownToEmbed(content, argsObj.file, {
                    title: argsObj.title,
                    description: argsObj.description
                });
            }

            if (parsed.title && !argsObj.title) { embed.setTitle(parsed.title as string); } else if (argsObj.title) { embed.setTitle(argsObj.title); }

            if (parsed.description && !argsObj.description) { embed.setDescription(parsed.description as string); } else if (argsObj.description) { embed.setDescription(argsObj.description); }

            if (argsObj.color) {
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                const match = hexRegex.exec(argsObj.color);
                if (match) { embed.setColor(`#${match[1]}`); } else { throw new Error('Invalid hex color format'); }
            } else {
                embed.setColor('#3498DB');
            }

            if (argsObj.image) { embed.setImage(argsObj.image); }
            if (argsObj.thumbnail) { embed.setThumbnail(argsObj.thumbnail); }
            if (argsObj.footer) { embed.setFooter({ text: argsObj.footer }); } else if (parsed.footer) { embed.setFooter(parsed.footer as { text: string }); }
            if (argsObj.author) { embed.setAuthor({ name: argsObj.author }); }
            if (argsObj.url) { embed.setURL(argsObj.url); }
            if (argsObj.timestamp === 'true' || argsObj.timestamp === true) { embed.setTimestamp(); }

            if (parsed.fields) {
                for (const field of parsed.fields as { name: string; value: string }[]) {
                    embed.addFields(field);
                }
            }

            try {
                const textChannel = channel as TextChannel | NewsChannel;
                await textChannel.send({ embeds: [embed] });
                return { success: true, message: 'Embed sent successfully' };
            } catch (err) {
                throw new Error(`Failed to send embed: ${(err as Error).message}`);
            }
        });
    }
}