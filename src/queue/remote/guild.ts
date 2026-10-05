import { logger } from '../../utils/logger.js';
import { Routes, Collection } from 'discord.js';
import type { DiscordAPI } from './discordApi.js';
import { RemoteChannel } from './channel.js';

export class RemoteGuild {
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

    readonly memberCount: number = 0;
    readonly ownerId: string | null = null;

    get me(): { id: string; permissions: { has: () => boolean }; roles: { cache: Collection<string, { id: string }>; highest: { position: number } } } {
        return {
            id: '0',
            permissions: { has: () => false },
            roles: { cache: new Collection(), highest: { position: 0 } }
        };
    }
}

export class RemoteGuildMembers {
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
            const data = await this._api.rest.get(Routes.guildMember(this._guildId, userId)) as {
                user?: { id?: string; username?: string; discriminator?: string };
                roles?: string[];
            };
            return {
                id: data.user?.id ?? userId,
                user: { id: data.user?.id ?? userId, tag: `${data.user?.username ?? 'Unknown'}#${data.user?.discriminator ?? '0'}`, username: data.user?.username ?? 'Unknown' },
                roles: { cache: new Collection((data.roles ?? []).map((r: string) => [r, { id: r }])) },
                permissions: { has: () => false }
            };
        } catch {
            return {
                id: userId,
                user: { id: userId, tag: 'Unknown#0', username: 'Unknown' },
                roles: { cache: new Collection() },
                permissions: { has: () => false }
            };
        }
    }
}

export class RemoteGuildChannels {
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
            const data = await this._api.rest.get(Routes.channel(id)) as { id: string; name: string };
            return new RemoteChannel(data.id, data.name, this._api);
        } catch {
            return new RemoteChannel(id, id, this._api);
        }
    }

    async create(options: Record<string, unknown>): Promise<RemoteChannel> {
        try {
            const data = await this._api.rest.post(Routes.guildChannels(this._guildId), {
                body: {
                    name: options['name'],
                    type: options['type'],
                    topic: options['topic'],
                    permission_overwrites: options['permissionOverwrites'],
                    parent: options['parent'],
                    rate_limit_per_user: options['rateLimitPerUser']
                }
            }) as { id: string; name: string };
            return new RemoteChannel(data.id, data.name, this._api);
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteGuildChannels] create failed' });
            throw err;
        }
    }
}

export class RemoteGuildRoles {
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
            const data = await this._api.rest.get(Routes.guildRole(this._guildId, id)) as {
                id: string;
                name: string;
                color: number;
                position: number;
                permissions: string;
            };
            return { id: data.id, name: data.name, color: data.color, position: data.position, permissions: data.permissions };
        } catch {
            return { id, name: id, color: 0, position: 0, permissions: '0' };
        }
    }
}

export class RemoteGuildBans {
    _guildId: string;
    _api: DiscordAPI;

    constructor(guildId: string, api: DiscordAPI) {
        this._guildId = guildId;
        this._api = api;
    }

    async create(userId: string, options: Record<string, unknown> = {}): Promise<void> {
        try {
            await this._api.rest.put(Routes.guildBan(this._guildId, userId), {
                body: { delete_message_seconds: options['deleteMessageSeconds'], reason: options['reason'] }
            });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteGuildBans] create failed' });
            throw err;
        }
    }

    async fetch(userId: string): Promise<{ user: unknown; reason: string } | null> {
        try {
            const data = await this._api.rest.get(Routes.guildBan(this._guildId, userId)) as { user: unknown; reason: string };
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
