/* eslint-disable no-console */
import { Routes, Collection } from 'discord.js';

export default class RemoteInteraction {
    constructor(data, rest, { commands, config } = {}) {
        this._data = data;
        this._rest = rest;
        this._replied = false;
        this._deferred = true;

        this.id = data.id;
        this.applicationId = data.applicationId;
        this.token = data.interactionToken;
        this.commandName = data.commandName;
        this.commandId = data.commandId;
        this.guildId = data.guildId;
        this.channelId = data.channelId;
        this.createdTimestamp = data.createdTimestamp;
        this.memberPermissions = data.memberPermissions || [];

        this.options = new RemoteOptions(data.options, data.resolved);

        const api = new DiscordAPI(rest, data.applicationId);

        this.user = {
            id: data.userId,
            tag: data.userTag || `${data.username}#${data.userDiscriminator || '0'}`,
            username: data.username,
            discriminator: data.userDiscriminator || '0',
            avatar: data.userAvatar,
            displayAvatarURL: (_opts = {}) => {
                if (!data.userAvatar) {return `https://cdn.discordapp.com/embed/avatars/${parseInt(data.userDiscriminator || '0') % 5}.png`;}
                const ext = _opts.dynamic && data.userAvatar.startsWith('a_') ? 'gif' : (_opts.format || 'png');
                return `https://cdn.discordapp.com/avatars/${data.userId}/${data.userAvatar}.${ext}?size=${_opts.size || 512}`;
            },
            toString: () => `<@${data.userId}>`
        };

        this.member = {
            id: data.userId,
            permissions: {
                has: (perm) => this.memberPermissions.includes(perm),
                toArray: () => [...this.memberPermissions]
            },
            roles: {
                cache: (data.memberRoles || []).reduce((m, id) => { m.set(id, { id }); return m; }, new Collection())
            }
        };

        this.channel = data.channelId ? new RemoteChannel(data.channelId, data.channelName, api) : null;
        this.guild = data.guildId ? new RemoteGuild(data.guildId, data.guildName, api) : null;

        this.client = {
            user: {
                id: config?.CLIENT_ID,
                displayAvatarURL: (_opts = {}) => 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            ws: { ping: 0 },
            stats: { commandsRan: 0, startTime: Date.now() },
            commands: commands || new Collection(),
            config: config || {},
            manager: config?.manager ? this._createManagerProxy(config.manager) : null,
            rest
        };
    }

    _createManagerProxy(managerInfo) {
        return {
            listPlugins: () => managerInfo.plugins || [],
            getPlugin: (id) => {
                const p = (managerInfo.plugins || []).find(pl => pl.id === id);
                return p ? { _enabled: p.enabled, _loaded: p.loaded } : null;
            },
            isEnabled: (id) => {
                const p = (managerInfo.plugins || []).find(pl => pl.id === id);
                return p ? p.enabled : false;
            },
            scanPlugins: () => managerInfo.scanned || [],
            enablePlugin: async() => { throw new Error('Plugin management not available in worker mode'); },
            disablePlugin: async() => { throw new Error('Plugin management not available in worker mode'); },
            loadPlugin: async() => { throw new Error('Plugin management not available in worker mode'); },
            reloadPlugin: async() => { throw new Error('Plugin management not available in worker mode'); },
            installPlugin: async() => { throw new Error('Plugin management not available in worker mode'); },
            uninstallPlugin: async() => { throw new Error('Plugin management not available in worker mode'); }
        };
    }

    get replied() { return this._replied; }
    get deferred() { return this._deferred; }
    set replied(v) { this._replied = v; }
    set deferred(v) { this._deferred = v; }

    async reply(options) {
        const body = buildMessageBody(options);
        try {
            await this._rest.patch(Routes.webhookMessage(this.applicationId, this.token), { body });
            this._replied = true;
        } catch (err) {
            console.error('[RemoteInteraction] reply failed:', err.message);
            throw err;
        }
    }

    async editReply(options) {
        const body = buildMessageBody(options);
        try {
            await this._rest.patch(Routes.webhookMessage(this.applicationId, this.token), { body });
            this._replied = true;
        } catch (err) {
            console.error('[RemoteInteraction] editReply failed:', err.message);
            throw err;
        }
    }

    async deferReply(_opts) {
        if (this._deferred) {return;}
        this._deferred = true;
    }

    async followUp(options) {
        const body = buildMessageBody(options);
        try {
            await this._rest.post(Routes.webhook(this.applicationId, this.token), { body });
        } catch (err) {
            console.error('[RemoteInteraction] followUp failed:', err.message);
            throw err;
        }
    }

    async deleteReply() {
        try {
            await this._rest.delete(Routes.webhookMessage(this.applicationId, this.token));
        } catch (err) {
            console.error('[RemoteInteraction] deleteReply failed:', err.message);
        }
    }

    async fetchReply() {
        try {
            const msg = await this._rest.get(Routes.webhookMessage(this.applicationId, this.token));
            return msg;
        } catch (err) {
            console.error('[RemoteInteraction] fetchReply failed:', err.message);
            return null;
        }
    }

    isChatInputCommand() { return true; }
    isCommand() { return true; }
    isButton() { return false; }
    isModalSubmit() { return false; }
    isSelectMenu() { return false; }
    isAutocomplete() { return false; }
    isUserContextMenuCommand() { return false; }
    isMessageContextMenuCommand() { return false; }
}

function buildMessageBody(options) {
    const body = {};
    if (options.content) {body.content = options.content;}
    if (options.embeds) {body.embeds = options.embeds;}
    if (options.components) {body.components = options.components;}
    if (options.files) {body.files = options.files;}
    if (options.allowedMentions) {body.allowed_mentions = options.allowedMentions;}
    if (options.tts) {body.tts = true;}
    if (options.flags) {body.flags = options.flags;}
    return body;
}

class RemoteOptions {
    constructor(optionsData = [], resolved = null) {
        this._data = optionsData || [];
        this._resolved = resolved;
        this.data = this._data;
    }

    getString(name) { return this._find(name)?.value ?? null; }
    getInteger(name) { const v = this._find(name)?.value; return v !== null && v !== undefined ? parseInt(v, 10) : null; }
    getBoolean(name) { const v = this._find(name)?.value; return v !== null && v !== undefined ? Boolean(v) : null; }
    getNumber(name) { const v = this._find(name)?.value; return v !== null && v !== undefined ? Number(v) : null; }
    getChannel(name) {
        const opt = this._find(name);
        if (!opt || !opt.value) {return null;}
        return this._resolved?.channels?.[opt.value] || { id: opt.value, name: opt.value };
    }
    getRole(name) {
        const opt = this._find(name);
        if (!opt || !opt.value) {return null;}
        return this._resolved?.roles?.[opt.value] || { id: opt.value, name: opt.value };
    }
    getUser(name) {
        const opt = this._find(name);
        if (!opt || !opt.value) {return null;}
        return this._resolved?.users?.[opt.value] || { id: opt.value, username: opt.value };
    }
    getMember(name) {
        const opt = this._find(name);
        if (!opt || !opt.value) {return null;}
        const resolvedUser = this._resolved?.users?.[opt.value];
        const resolvedMember = this._resolved?.members?.[opt.value];
        if (resolvedUser) {
            return { ...resolvedUser, ...resolvedMember, roles: { cache: new Collection() } };
        }
        return { id: opt.value };
    }
    getMessage(name) {
        const opt = this._find(name);
        return opt?.value || null;
    }
    getSubcommand() {
        const sub = this._data.find(o => o.type === 1 || o.type === 2);
        return sub?.name || null;
    }
    getSubcommandGroup() {
        const group = this._data.find(o => o.type === 2);
        return group?.name || null;
    }
    getFocused() {
        const focused = this._data.find(o => o.focused);
        return focused ? { name: focused.name, value: focused.value, type: focused.type } : null;
    }

    _find(name) { return this._data.find(o => o.name === name); }
}

class RemoteGuild {
    constructor(id, name, api) {
        this.id = id;
        this.name = name || id;
        this._api = api;
        this.members = new RemoteGuildMembers(id, api);
        this.channels = new RemoteGuildChannels(id, api);
        this.roles = new RemoteGuildRoles(id, api);
        this.bans = new RemoteGuildBans(id, api);
    }

    get memberCount() { return 0; }
    get ownerId() { return null; }

    get me() {
        return {
            id: '0',
            permissions: { has: () => false },
            roles: { cache: new Collection(), highest: { position: 0 } }
        };
    }
}

class RemoteGuildMembers {
    constructor(guildId, api) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(userId) {
        if (!userId) {throw new Error('userId is required');}
        try {
            const data = await this._api.rest.get(Routes.guildMember(this._guildId, userId));
            return {
                id: data.user?.id || userId,
                user: { id: data.user?.id || userId, tag: `${data.user?.username || 'Unknown'}#${data.user?.discriminator || '0'}`, username: data.user?.username || 'Unknown' },
                roles: { cache: new Collection((data.roles || []).map(r => [r, { id: r }])) },
                permissions: { has: () => false }
            };
        } catch {
            return { id: userId, user: { id: userId } };
        }
    }
}

class RemoteGuildChannels {
    constructor(guildId, api) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(id) {
        try {
            const data = await this._api.rest.get(Routes.channel(id));
            return new RemoteChannel(data.id, data.name, this._api);
        } catch {
            return new RemoteChannel(id, id, this._api);
        }
    }

    async create(options) {
        try {
            const data = await this._api.rest.post(Routes.guildChannels(this._guildId), {
                body: { name: options.name, type: options.type, topic: options.topic, permission_overwrites: options.permissionOverwrites, parent: options.parent, rate_limit_per_user: options.rateLimitPerUser }
            });
            return new RemoteChannel(data.id, data.name, this._api);
        } catch (err) {
            console.error('[RemoteGuildChannels] create failed:', err.message);
            throw err;
        }
    }
}

class RemoteGuildRoles {
    constructor(guildId, api) {
        this._guildId = guildId;
        this._api = api;
        this.cache = new Collection();
    }

    async fetch(id) {
        try {
            const data = await this._api.rest.get(Routes.guildRole(this._guildId, id));
            return { id: data.id, name: data.name, color: data.color, position: data.position, permissions: data.permissions };
        } catch {
            return { id, name: id };
        }
    }
}

class RemoteGuildBans {
    constructor(guildId, api) {
        this._guildId = guildId;
        this._api = api;
    }

    async create(userId, options = {}) {
        try {
            await this._api.rest.put(Routes.guildBan(this._guildId, userId), {
                body: { delete_message_seconds: options.deleteMessageSeconds, reason: options.reason }
            });
        } catch (err) {
            console.error('[RemoteGuildBans] create failed:', err.message);
            throw err;
        }
    }

    async fetch(userId) {
        try {
            const data = await this._api.rest.get(Routes.guildBan(this._guildId, userId));
            return { user: data.user, reason: data.reason };
        } catch {
            return null;
        }
    }

    async remove(userId) {
        try {
            await this._api.rest.delete(Routes.guildBan(this._guildId, userId));
        } catch (err) {
            console.error('[RemoteGuildBans] remove failed:', err.message);
            throw err;
        }
    }
}

class RemoteChannel {
    constructor(id, name, api) {
        this.id = id;
        this.name = name || id;
        this._api = api;
        this.messages = new RemoteMessages(id, api);
        this.permissionOverwrites = new RemotePermissionOverwrites(id, api);
    }

    async send(options) {
        const body = buildMessageBody(typeof options === 'string' ? { content: options } : options);
        try {
            const msg = await this._api.rest.post(Routes.channelMessages(this.id), { body });
            return msg;
        } catch (err) {
            console.error('[RemoteChannel] send failed:', err.message);
            throw err;
        }
    }

    async createInvite(options = {}) {
        try {
            const invite = await this._api.rest.post(Routes.channelInvites(this.id), {
                body: { max_age: options.maxAge || 86400, max_uses: options.maxUses || 0, temporary: options.temporary || false }
            });
            return { code: invite.code, url: `https://discord.gg/${invite.code}` };
        } catch (err) {
            console.error('[RemoteChannel] createInvite failed:', err.message);
            throw err;
        }
    }

    async setTopic(topic) {
        try {
            await this._api.rest.patch(Routes.channel(this.id), { body: { topic } });
        } catch (err) {
            console.error('[RemoteChannel] setTopic failed:', err.message);
        }
    }
}

class RemoteMessages {
    constructor(channelId, api) {
        this._channelId = channelId;
        this._api = api;
    }

    async fetch(id) {
        try {
            const data = await this._api.rest.get(Routes.channelMessage(this._channelId, id));
            return data;
        } catch {
            return null;
        }
    }
}

class RemotePermissionOverwrites {
    constructor(channelId, api) {
        this._channelId = channelId;
        this._api = api;
    }

    async edit(id, options) {
        try {
            const allow = typeof options.allow === 'bigint' ? options.allow.toString() : (options.allow || '0');
            const deny = typeof options.deny === 'bigint' ? options.deny.toString() : (options.deny || '0');
            await this._api.rest.put(Routes.channelPermission(this._channelId, id), {
                body: { type: options.type || 1, allow, deny }
            });
        } catch (err) {
            console.error('[RemotePermissionOverwrites] edit failed:', err.message);
        }
    }
}

class DiscordAPI {
    constructor(rest, applicationId) {
        this.rest = rest;
        this.applicationId = applicationId;
    }
}
