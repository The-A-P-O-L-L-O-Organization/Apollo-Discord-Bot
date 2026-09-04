import { Plugin } from '../../core/Plugin.js';
// @ts-expect-error - JS files not yet migrated
import { initReminderScheduler, stopReminderScheduler } from '../../utils/reminderScheduler.js';
// @ts-expect-error - JS files not yet migrated
import { initPollScheduler, stopPollScheduler } from '../../utils/pollScheduler.js';
// @ts-expect-error - JS files not yet migrated
import { initAnalyticsCollector, stopAnalyticsCollector } from '../../utils/analyticsCollector.js';
// @ts-expect-error - JS files not yet migrated
import TranslationService from '../../utils/translation.js';
import { createLogger } from '../../utils/logger.js';

export default class UtilityPlugin extends Plugin {
    public declare logger: ReturnType<typeof createLogger>;

    constructor(client: any, manager: any) {
        super(client, manager);
        this.logger = createLogger({ component: 'plugin:utility' });
    }

    static override get id() { return 'utility'; }
    static override get version() { return '1.0.0'; }
    static override get dependencies() { return []; }

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
            this.logger.warn('[Utility] Translation service not available:', (error as Error).message);
        }
    }

    override async onDisable() {
        this._unloadCommands();
        this._unloadEvents();
        this._stopSchedulers();
        stopReminderScheduler();
        stopPollScheduler();
        stopAnalyticsCollector();
    }

    _registerSocketHandlers() {
        this.manager.registerSocketHandler('utility.serverinfo', async (_client: any, args: any) => {
            const guild = _client.guilds.cache.get(args.guild);
            if (!guild) { throw new Error(`Guild ${args.guild} not found`); }
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

        this.manager.registerSocketHandler('utility.userinfo', async (_client: any, args: any) => {
            const guild = _client.guilds.cache.get(args.guild);
            if (!guild) { throw new Error(`Guild ${args.guild} not found`); }
            const member = await guild.members.fetch(args.user).catch(() => null);
            if (!member) { throw new Error(`User ${args.user} not found in guild`); }
            return {
                id: member.id,
                tag: member.user.tag,
                nickname: member.nickname,
                joinedAt: member.joinedAt?.toISOString(),
                roles: member.roles.cache.map(r => r.name),
                permissions: member.permissions.toArray()
            };
        });

        this.manager.registerSocketHandler('utility.ping', async (_client: any, _args: any) => {
            return { ping: _client.ws.ping, websocket: 'connected' };
        });

        this.manager.registerSocketHandler('utility.embed', async (_client: any, args: any) => {
            const { EmbedBuilder } = await import('discord.js');
            const { parseMarkdownToEmbed } = await import('../../../utils/markdownParser.js');
            const { readFileSync } = await import('fs');
            const { resolve, sep } = await import('path');

            const channel = _client.channels.cache.get(args.channel);
            if (!channel) { throw new Error(`Channel ${args.channel} not found`); }
            if (!channel.isTextBased()) { throw new Error(`Channel ${args.channel} is not a text channel`); }

            const embed = new EmbedBuilder();

            let parsed: Record<string, unknown> = {};
            if (args.file) {
                const DATA_ROOT = resolve(process.cwd(), 'data');
                const targetPath = resolve(DATA_ROOT, args.file);
                if (!targetPath.startsWith(DATA_ROOT + sep)) {
                    throw new Error('File path must be within the data directory.');
                }
                let content;
                try {
                    content = readFileSync(targetPath, 'utf-8');
                } catch {
                    throw new Error(`Could not read file: ${args.file}`);
                }
                if (!content.trim()) { throw new Error('The file is empty'); }
                parsed = parseMarkdownToEmbed(content, args.file, {
                    title: args.title,
                    description: args.description
                });
            }

            if (parsed.title && !args.title) { embed.setTitle(parsed.title as string); } else if (args.title) { embed.setTitle(args.title); }

            if (parsed.description && !args.description) { embed.setDescription(parsed.description as string); } else if (args.description) { embed.setDescription(args.description); }

            if (args.color) {
                const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
                const match = args.color.match(hexRegex);
                if (match) { embed.setColor(`#${match[1]}`); } else { throw new Error('Invalid hex color format'); }
            } else {
                embed.setColor('#3498DB');
            }

            if (args.image) { embed.setImage(args.image); }
            if (args.thumbnail) { embed.setThumbnail(args.thumbnail); }
            if (args.footer) { embed.setFooter({ text: args.footer }); } else if (parsed.footer) { embed.setFooter(parsed.footer as any); }
            if (args.author) { embed.setAuthor({ name: args.author }); }
            if (args.url) { embed.setURL(args.url); }
            if (args.timestamp === 'true' || args.timestamp === true) { embed.setTimestamp(); }

            if (parsed.fields) {
                for (const field of parsed.fields as any[]) {
                    embed.addFields(field);
                }
            }

            try {
                await channel.send({ embeds: [embed] });
                return { success: true, message: 'Embed sent successfully' };
            } catch (err) {
                throw new Error(`Failed to send embed: ${(err as Error).message}`);
            }
        });
    }
}