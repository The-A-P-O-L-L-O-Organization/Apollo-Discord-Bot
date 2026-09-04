// Remote Interaction - TypeScript migration
// Reconstructs Discord interactions from serialized queue data

import { logger } from '../utils/logger.js';
import { Routes, Collection } from 'discord.js';

export default class RemoteInteraction {
    _data: Record<string, unknown>;
    _rest: unknown;
    _replied: boolean;
    _deferred: boolean;

    id: string;
    applicationId: string;
    token: string;
    commandName: string;
    commandId: string;
    guildId: string | null;
    channelId: string;
    createdTimestamp: number;
    memberPermissions: string[];
    options: RemoteOptions;
    user: {
        id: string;
        tag: string;
        username: string;
        discriminator: string;
        avatar: string | null;
        displayAvatarURL: (_opts?: { dynamic?: boolean; format?: string; size?: number }) => string;
        toString: () => string;
    };
    member: {
        id: string;
        permissions: {
            has: (_perm: string) => boolean;
            toArray: () => string[];
        };
        roles: {
            cache: Collection<string, { id: string }>;
        };
    };
    channel: RemoteChannel | null;
    guild: RemoteGuild | null;
    client: {
        user: {
            id: string | undefined;
            displayAvatarURL: (_opts?: { dynamic?: boolean; format?: string; size?: number }) => string;
        };
        ws: { ping: number };
        stats: { commandsRan: number; startTime: number };
        commands: Collection<string, unknown>;
        config: Record<string, unknown>;
        manager: unknown;
        rest: unknown;
    };

    constructor(
        data: Record<string, unknown>,
        rest: unknown,
        { commands, config }: { commands?: Collection<string, unknown>; config?: Record<string, unknown> } = {}
    ) {
        this._data = data;
        this._rest = rest;
        this._replied = false;
        this._deferred = true;

        this.id = data.id as string;
        this.applicationId = data.applicationId as string;
        this.token = data.interactionToken as string;
        this.commandName = data.commandName as string;
        this.commandId = data.commandId as string;
        this.guildId = data.guildId as string | null;
        this.channelId = data.channelId as string;
        this.createdTimestamp = data.createdTimestamp as number;
        this.memberPermissions = (data.memberPermissions as string[]) || [];

        this.options = new RemoteOptions(data.options, data.resolved);

        const api = new DiscordAPI(rest, data.applicationId as string);

        this.user = {
            id: data.userId as string,
            tag: data.userTag as string || `${data.username as string}#${data.userDiscriminator as string || '0'}`,
            username: data.username as string,
            discriminator: data.userDiscriminator as string || '0',
            avatar: data.userAvatar as string | null,
            displayAvatarURL: (_opts = {}) => {
                if (!data.userAvatar) {
                    return `https://cdn.discordapp.com/embed/avatars/${parseInt(data.userDiscriminator as string || '0') % 5}.png`;
                }
                const ext = _opts.dynamic && (data.userAvatar as string).startsWith('a_') ? 'gif' : (_opts.format || 'png');
                return `https://cdn.discordapp.com/avatars/${data.userId}/${data.userAvatar}.${ext}?size=${_opts.size || 512}`;
            },
            toString: () => `<@${data.userId}>`
        };

        this.member = {
            id: data.userId as string,
            permissions: {
                has: (perm: string) => this.memberPermissions.includes(perm),
                toArray: () => [...this.memberPermissions]
            },
            roles: {
                cache: (data.memberRoles as string[] || []).reduce((m, id) => { m.set(id, { id }); return m; }, new Collection())
            }
        };

        this.channel = data.channelId ? new RemoteChannel(data.channelId as string, data.channelName as string, api) : null;
        this.guild = data.guildId ? new RemoteGuild(data.guildId as string, data.guildName as string, api) : null;

        this.client = {
            user: {
                id: config?.CLIENT_ID as string | undefined,
                displayAvatarURL: (_opts = {}) => 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            ws: { ping: 0 },
            stats: { commandsRan: 0, startTime: Date.now() },
            commands: commands || new Collection(),
            config: config || {},
            manager: config?.manager ? this._createManagerProxy(config.manager as Record<string, unknown>) : null,
            rest
        };
    }

    _createManagerProxy(managerInfo: Record<string, unknown>) {
        return {
            listPlugins: () => managerInfo.plugins || [],
            getPlugin: (id: string) => {
                const p = (managerInfo.plugins as Array<{ id: string }> || []).find(pl => pl.id === id);
                return p ? { _enabled: p.enabled, _loaded: p.loaded } : null;
            },
            isEnabled: (id: string) => {
                const p = (managerInfo.plugins as Array<{ id: string }> || []).find(pl => pl.id === id);
                return p ? p.enabled : false;
            },
            scanPlugins: () => managerInfo.scanned || [],
            enablePlugin: async () => { throw new Error('Plugin management not available in worker mode'); },
            disablePlugin: async () => { throw new Error('Plugin management not available in worker mode'); },
            loadPlugin: async () => { throw new Error('Plugin management not available in worker mode'); },
            reloadPlugin: async () => { throw new Error('Plugin management not available in worker mode'); },
            installPlugin: async () => { throw new Error('Plugin management not available in worker mode'); },
            uninstallPlugin: async () => { throw new Error('Plugin management not available in worker mode'); }
        };
    }

    get replied() { return this._replied; }
    get deferred() { return this._deferred; }
    set replied(v: boolean) { this._replied = v; }
    set deferred(v: boolean) { this._deferred = v; }

    async reply(options: Record<string, unknown>): Promise<void> {
        const body = buildMessageBody(options);
        try {
            // @ts-expect-error rest type
            await this._rest.patch(Routes.webhookMessage(this.applicationId, this.token), { body });
            this._replied = true;
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] reply failed' });
            throw err;
        }
    }

    async editReply(options: Record<string, unknown>): Promise<void> {
        const body = buildMessageBody(options);
        try {
            // @ts-expect-error rest type
            await this._rest.patch(Routes.webhookMessage(this.applicationId, this.token), { body });
            this._replied = true;
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] editReply failed' });
            throw err;
        }
    }

    async deferReply(_opts: Record<string, unknown>): Promise<void> {
        if (this._deferred) { return; }
        this._deferred = true;
    }

    async followUp(options: Record<string, unknown>): Promise<void> {
        const body = buildMessageBody(options);
        try {
            // @ts-expect-error rest type
            await this._rest.post(Routes.webhook(this.applicationId, this.token), { body });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] followUp failed' });
            throw err;
        }
    }

    async deleteReply(): Promise<void> {
        try {
            // @ts-expect-error rest type
            await this._rest.delete(Routes.webhookMessage(this.applicationId, this.token));
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] deleteReply failed' });
        }
    }

    async fetchReply(): Promise<unknown> {
        try {
            // @ts-expect-error rest type
            const msg = await this._rest.get(Routes.webhookMessage(this.applicationId, this.token));
            return msg;
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] fetchReply failed' });
            return null;
        }
    }

    isChatInputCommand(): boolean { return true; }
    isCommand(): boolean { return true; }
    isButton(): boolean { return false; }
    isModalSubmit(): boolean { return false; }
    isSelectMenu(): boolean { return false; }
    isAutocomplete(): boolean { return false; }
    isUserContextMenuCommand(): boolean { return false; }
    isMessageContextMenuCommand(): boolean { return false; }
}

function buildMessageBody(options: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (options.content) { body.content = options.content; }
    if (options.embeds) { body.embeds = options.embeds; }
    if (options.components) { body.components = options.components; }
    if (options.files) { body.files = options.files; }
    if (options.allowedMentions) { body.allowed_mentions = options.allowedMentions; }
    if (options.tts) { body.tts = true; }
    if (options.flags) { body.flags = options.flags; }
    return body;
}

class RemoteOptions {
    _data: Array<{ name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }>;
    _resolved: Record<string, unknown> | null;
    data: Array<{ name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }>;

    constructor(optionsData: Array<{ name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }> = [], resolved: Record<string, unknown> | null = null) {
        this._data = optionsData || [];
        this._resolved = resolved;
        this.data = this._data;
    }

    getString(name: string): string | null { return this._find(name)?.value as string ?? null; }
    getInteger(name: string): number | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? parseInt(v as string, 10) : null; }
    getBoolean(name: string): boolean | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? Boolean(v) : null; }
    getNumber(name: string): number | null { const v = this._find(name)?.value; return v !== null && v !== undefined ? Number(v) : null; }
    getChannel(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt || !opt.value) { return null; }
        return this._resolved?.channels?.[opt.value as string] || { id: opt.value, name: opt.value };
    }
    getRole(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt || !opt.value) { return null; }
        return this._resolved?.roles?.[opt.value as string] || { id: opt.value, name: opt.value };
    }
    getUser(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt || !opt.value) { return null; }
        return this._resolved?.users?.[opt.value as string] || { id: opt.value, username: opt.value };
    }
    getMember(name: string): Record<string, unknown> | null {
        const opt = this._find(name);
        if (!opt || !opt.value) { return null; }
        const resolvedUser = this._resolved?.users?.[opt.value as string];
        const resolvedMember = this._resolved?.members?.[opt.value as string];
        if (resolvedUser) {
            return { ...resolvedUser as Record<string, unknown>, ...resolvedMember as Record<string, unknown>, roles: { cache: new Collection() } };
        }
        return { id: opt.value };
    }
    getMessage(name: string): unknown { const opt = this._find(name); return opt?.value ?? null; }
    getSubcommand(): string | null {
        const sub = this._data.find(o => o.type === 1 || o.type === 2);
        return sub?.name || null;
    }
    getSubcommandGroup(): string | null {
        const group = this._data.find(o => o.type === 2);
        return group?.name || null;
    }
    getFocused(): { name: string; value: unknown; type: number } | null {
        const focused = this._data.find(o => o.focused);
        return focused ? { name: focused.name, value: focused.value, type: focused.type } : null;
    }

    _find(name: string) { return this._data.find(o => o.name === name); }
}

class RemoteGuild {
    id: string;
    name: string;
    _api: DiscordAPI;
    members: RemoteGuildMembers;
    channels: RemoteGuildChannels;
    roles: RemoteGuildRoles;
    bans: RemoteGuildBans;

    constructor(id: string, name: string, api: DiscordAPI) {
        this.id = id;
        this.name = name || id;
        this._api = api;
        this.members = new RemoteGuildMembers(id, api);
        this.channels = new RemoteGuildChannels(id, api);
        this.roles = new RemoteGuildRoles(id, api);
        this.bans = new RemoteGuildBans(id, api);
    }

    get memberCount(): number { return 0; }
    get ownerId(): string | null { return null; }

    get me(): { id: string; permissions: { has: () => boolean }; roles: { cache: Collection<string, { id: string }>; highest: { position: number } } } {
        return {
            id: '0',
            permissions: { has: () => false },
            roles: { cache: new Collection(), highest: { position: 0 } }
        };
    }
}

class RemoteGuildMembers {
    _guildId: string;
    _api: DiscordAPI;
    cache: Collection<string, unknown>;

    constructor(guildId: string, api: DiscordAPI) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(userId: string): Promise<{ id: string; user: { id: string; tag: string; username: string }; roles: { cache: Collection<string, { id: string }> }; permissions: { has: () => boolean } }> {
        if (!userId) { throw new Error('userId is required'); }
        try {
            const data = await this._api.rest.get(Routes.guildMember(this._guildId, userId));
            return {
                id: data.user?.id || userId,
                user: { id: data.user?.id || userId, tag: `${data.user?.username || 'Unknown'}#${data.user?.discriminator || '0'}`, username: data.user?.username || 'Unknown' },
                roles: { cache: new Collection((data.roles || []).map((r: string) => [r, { id: r }])) },
                permissions: { has: () => false }
            };
        } catch {
            return { id: userId, user: { id: userId } };
        }
    }
}

class RemoteGuildChannels {
    _guildId: string;
    _api: DiscordAPI;
    cache: Collection<string, unknown>;

    constructor(guildId: string, api: DiscordAPI) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(id: string): Promise<RemoteChannel> {
        try {
            const data = await this._api.rest.get(Routes.channel(id));
            return new RemoteChannel(data.id, data.name, this._api);
        } catch {
            return new RemoteChannel(id, id, this._api);
        }
    }

    async create(options: Record<string, unknown>): Promise<RemoteChannel> {
        try {
            const data = await this._api.rest.post(Routes.guildChannels(this._guildId), {
                body: {
                    name: options.name,
                    type: options.type,
                    topic: options.topic,
                    permission_overwrites: options.permissionOverwrites,
                    parent: options.parent,
                    rate_limit_per_user: options.rateLimitPerUser
                }
            });
            return new RemoteChannel(data.id, data.name, this._api);
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteGuildChannels] create failed' });
            throw err;
        }
    }
}

class RemoteGuildRoles {
    _guildId: string;
    _api: DiscordAPI;
    cache: Collection<string, unknown>;

    constructor(guildId: string, api: DiscordAPI) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(id: string): Promise<{ id: string; name: string; color: number; position: number; permissions: string }> {
        try {
            const data = await this._api.rest.get(Routes.guildRole(this._guildId, id));
            return { id: data.id, name: data.name, color: data.color, position: data.position, permissions: data.permissions };
        } catch {
            return { id, name: id };
        }
    }
}

class RemoteGuildBans {
    _guildId: string;
    _api: DiscordAPI;

    constructor(guildId: string, api: DiscordAPI) {
        this._guildId = guildId;
        this._api = api;
    }

    async create(userId: string, options: Record<string, unknown> = {}): Promise<void> {
        try {
            await this._api.rest.put(Routes.guildBan(this._guildId, userId), {
                body: { delete_message_seconds: options.deleteMessageSeconds, reason: options.reason }
            });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteGuildBans] create failed' });
            throw err;
        }
    }

    async fetch(userId: string): Promise<{ user: unknown; reason: string } | null> {
        try {
            const data = await this._api.rest.get(Routes.guildBan(this._guildId, userId));
            return { user: data.user, reason: data.reason };
        } catch {
            return null;
        }
    }

    async remove(userId: string): Promise<void> {
        try {
            await this._api.rest.delete(Routes.guildBan(this._guildId, userId));
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteGuildBans] remove failed' });
            throw err;
        }
    }
}

class RemoteChannel {
    id: string;
    name: string;
    _api: DiscordAPI;
    messages: RemoteMessages;
    permissionOverwrites: RemotePermissionOverwrites;

    constructor(id: string, name: string, api: DiscordAPI) {
        this.id = id;
        this.name = name || id;
        this._api = api;
        this.messages = new RemoteMessages(id, api);
        this.permissionOverwrites = new RemotePermissionOverwrites(id, api);
    }

    async send(options: Record<string, unknown> | string): Promise<unknown> {
        const body = buildMessageBody(typeof options === 'string' ? { content: options } : options);
        try {
            const msg = await this._api.rest.post(Routes.channelMessages(this.id), { body });
            return msg;
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteChannel] send failed' });
            throw err;
        }
    }

    async createInvite(options: Record<string, unknown> = {}): Promise<{ code: string; url: string }> {
        try {
            const invite = await this._api.rest.post(Routes.channelInvites(this.id), {
                body: { max_age: options.maxAge || 86400, max_uses: options.maxUses || 0, temporary: options.temporary || false }
            });
            return { code: invite.code, url: `https://discord.gg/${invite.code}` };
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteChannel] createInvite failed' });
            throw err;
        }
    }

    async setTopic(topic: string): Promise<void> {
        try {
            await this._api.rest.patch(Routes.channel(this.id), { body: { topic } });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteChannel] setTopic failed' });
        }
    }
}

class RemoteMessages {
    _channelId: string;
    _api: DiscordAPI;

    constructor(channelId: string, api: DiscordAPI) {
        this._channelId = channelId;
        this._api = api;
    }

    async fetch(id: string): Promise<unknown> {
        try {
            const data = await this._api.rest.get(Routes.channelMessage(this._channelId, id));
            return data;
        } catch {
            return null;
        }
    }
}

class RemotePermissionOverwrites {
    _channelId: string;
    _api: DiscordAPI;

    constructor(channelId: string, api: DiscordAPI) {
        this._channelId = channelId;
        this._api = api;
    }

    async edit(id: string, options: Record<string, unknown>): Promise<void> {
        try {
            const allow = typeof options.allow === 'bigint' ? options.allow.toString() : (options.allow || '0');
            const deny = typeof options.deny === 'bigint' ? options.deny.toString() : (options.deny || '0');
            await this._api.rest.put(Routes.channelPermission(this._channelId, id), {
                body: { type: options.type || 1, allow, deny }
            });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemotePermissionOverwrites] edit failed' });
        }
    }
}

class DiscordAPI {
    rest: unknown;
    applicationId: string;

    constructor(rest: unknown, applicationId: string) {
        this.rest = rest;
        this.applicationId = applicationId;
    }
}