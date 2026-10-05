import { logger } from '../../utils/logger.js';
import { Routes, Collection } from 'discord.js';
import type { REST } from 'discord.js';
import { RemoteOptions } from './options.js';
import { RemoteGuild } from './guild.js';
import { RemoteChannel, buildMessageBody } from './channel.js';
import { DiscordAPI } from './discordApi.js';

export default class RemoteInteraction {
    _data: Record<string, unknown>;
    _rest: REST;
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
    locale: string;
    guildLocale: string | null;
    resolvedLocale: string;
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
        rest: REST;
    };

    constructor(
        data: Record<string, unknown>,
        rest: REST,
        { commands, config }: { commands?: Collection<string, unknown>; config?: Record<string, unknown> } = {}
    ) {
        this._data = data;
        this._rest = rest;
        this._replied = false;
        this._deferred = true;

        this.id = data['id'] as string;
        this.applicationId = (data['applicationId'] as string) ?? '';
        const nestedUser = data['user'] as Record<string, unknown> | undefined;
        const isSerialized = typeof nestedUser === 'object' && nestedUser !== null && typeof data['token'] === 'string';
        const nestedData = isSerialized ? (data['data'] as Record<string, unknown> | null) : null;
        const nestedMember = isSerialized ? (data['member'] as Record<string, unknown> | null) : null;
        this.token = (isSerialized ? data['token'] : data['interactionToken']) as string;
        this.commandName = ((isSerialized ? nestedData?.['name'] : undefined) ?? data['commandName']) as string;
        this.commandId = ((isSerialized ? nestedData?.['id'] : undefined) ?? data['commandId']) as string;
        this.guildId = data['guildId'] as string | null;
        this.channelId = data['channelId'] as string;
        this.createdTimestamp = (data['createdTimestamp'] as number) ?? Date.now();
        const rawPermissions = nestedMember?.['permissions'];
        const nestedPermissions = typeof rawPermissions === 'string'
            ? rawPermissions.split(',').map(p => p.trim()).filter(p => p.length > 0 && p !== '0')
            : [];
        this.memberPermissions = (data['memberPermissions'] as string[]) ?? nestedPermissions ?? [];
        this.locale = (data['locale'] as string) ?? 'en-US';
        this.guildLocale = (data['guildLocale'] as string | null) ?? null;
        this.resolvedLocale = (data['resolvedLocale'] as string) ?? this.locale ?? 'en-US';

        this.options = new RemoteOptions(
            ((isSerialized ? nestedData?.['options'] : data['options']) as { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[]) || [],
            (isSerialized ? null : data['resolved']) as Record<string, unknown> | null
        );

        const api = new DiscordAPI(rest, this.applicationId);

        const userId = (isSerialized ? nestedUser['id'] : data['userId']) as string;
        const username = (isSerialized ? nestedUser['username'] : data['username']) as string;
        const userDiscriminator = (isSerialized ? nestedUser['discriminator'] : data['userDiscriminator']) as string || '0';
        const userAvatar = (isSerialized ? nestedUser['avatar'] : data['userAvatar']) as string | null;
        const userTag = (isSerialized ? `${username}#${userDiscriminator}` : data['userTag'] as string) || `${username}#${userDiscriminator}`;
        const nestedRoles = Array.isArray(nestedMember?.['roles']) ? (nestedMember['roles'] as string[]) : [];
        const memberRoles = (data['memberRoles'] as string[]) ?? nestedRoles ?? [];

        this.user = {
            id: userId,
            tag: userTag,
            username,
            discriminator: userDiscriminator,
            avatar: userAvatar ?? null,
            displayAvatarURL: (_opts = {}) => {
                if (!userAvatar) {
                    return `https://cdn.discordapp.com/embed/avatars/${parseInt(userDiscriminator || '0') % 5}.png`;
                }
                const ext = _opts.dynamic && userAvatar.startsWith('a_') ? 'gif' : (_opts.format ?? 'png');
                return `https://cdn.discordapp.com/avatars/${userId}/${userAvatar}.${ext}?size=${_opts.size ?? 512}`;
            },
            toString: () => `<@${userId}>`
        };

        this.member = {
            id: userId,
            permissions: {
                has: (perm: string) => this.memberPermissions.includes(perm),
                toArray: () => [...this.memberPermissions]
            },
            roles: {
                cache: new Collection<string, { id: string }>(memberRoles.map(id => [id, { id }]))
            }
        };

        this.channel = data['channelId'] ? new RemoteChannel(data['channelId'] as string, data['channelName'] as string, api) : null;
        this.guild = data['guildId'] ? new RemoteGuild(data['guildId'] as string, data['guildName'] as string, api) : null;

        this.client = {
            user: {
                id: config?.['CLIENT_ID'] as string | undefined,
                displayAvatarURL: (_opts = {}) => 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            ws: { ping: 0 },
            stats: { commandsRan: 0, startTime: Date.now() },
            commands: commands ?? new Collection(),
            config: config ?? {},
            manager: config?.['manager'] ? this._createManagerProxy(config['manager'] as Record<string, unknown>) : null,
            rest
        };
    }

    _createManagerProxy(managerInfo: Record<string, unknown>) {
        return {
            listPlugins: () => managerInfo['plugins'] ?? [],
            getPlugin: (id: string) => {
                const p = (managerInfo['plugins'] as { id: string; enabled: boolean; loaded: boolean }[] || []).find(pl => pl.id === id);
                return p ? { _enabled: p.enabled, _loaded: p.loaded } : null;
            },
            isEnabled: (id: string) => {
                const p = (managerInfo['plugins'] as { id: string; enabled: boolean }[] || []).find(pl => pl.id === id);
                return p ? p.enabled : false;
            },
            scanPlugins: () => managerInfo['scanned'] ?? [],
            enablePlugin: () => { throw new Error('Plugin management not available in worker mode'); },
            disablePlugin: () => { throw new Error('Plugin management not available in worker mode'); },
            loadPlugin: () => { throw new Error('Plugin management not available in worker mode'); },
            reloadPlugin: () => { throw new Error('Plugin management not available in worker mode'); },
            installPlugin: () => { throw new Error('Plugin management not available in worker mode'); },
            uninstallPlugin: () => { throw new Error('Plugin management not available in worker mode'); }
        };
    }

    get replied() { return this._replied; }
    set replied(v: boolean) { this._replied = v; }
    get deferred() { return this._deferred; }
    set deferred(v: boolean) { this._deferred = v; }

    async reply(options: Record<string, unknown>): Promise<void> {
        const body = buildMessageBody(options);
        try {
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
            await this._rest.patch(Routes.webhookMessage(this.applicationId, this.token), { body });
            this._replied = true;
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] editReply failed' });
            throw err;
        }
    }

    deferReply(_opts: Record<string, unknown>): Promise<void> {
        if (this._deferred) { return Promise.resolve(); }
        this._deferred = true;
        return Promise.resolve();
    }

    async followUp(options: Record<string, unknown>): Promise<void> {
        const body = buildMessageBody(options);
        try {
            await this._rest.post(Routes.webhook(this.applicationId, this.token), { body });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] followUp failed' });
            throw err;
        }
    }

    async deleteReply(): Promise<void> {
        try {
            await this._rest.delete(Routes.webhookMessage(this.applicationId, this.token));
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemoteInteraction] deleteReply failed' });
        }
    }

    async fetchReply(): Promise<unknown> {
        try {
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
