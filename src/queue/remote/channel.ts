import { logger } from '../../utils/logger.js';
import { Routes } from 'discord.js';
import type { DiscordAPI } from './discordApi.js';

export function buildMessageBody(options: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (options['content']) { body['content'] = options['content']; }
    if (options['embeds']) { body['embeds'] = options['embeds']; }
    if (options['components']) { body['components'] = options['components']; }
    if (options['files']) { body['files'] = options['files']; }
    if (options['allowedMentions']) { body['allowed_mentions'] = options['allowedMentions']; }
    if (options['tts']) { body['tts'] = true; }
    if (options['flags']) { body['flags'] = options['flags']; }
    return body;
}

export class RemoteChannel {
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
                body: { max_age: options['maxAge'] ?? 86400, max_uses: options['maxUses'] ?? 0, temporary: options['temporary'] ?? false }
            }) as { code: string };
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

export class RemoteMessages {
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

export class RemotePermissionOverwrites {
    _channelId: string;
    _api: DiscordAPI;

    constructor(channelId: string, api: DiscordAPI) {
        this._channelId = channelId;
        this._api = api;
    }

    async edit(id: string, options: Record<string, unknown>): Promise<void> {
        try {
            const allow = typeof options['allow'] === 'bigint' ? options['allow'].toString() : (options['allow'] ?? '0');
            const deny = typeof options['deny'] === 'bigint' ? options['deny'].toString() : (options['deny'] ?? '0');
            await this._api.rest.put(Routes.channelPermission(this._channelId, id), {
                body: { type: options['type'] ?? 1, allow, deny }
            });
        } catch (err) {
            logger.error({ err: err as Error, msg: '[RemotePermissionOverwrites] edit failed' });
        }
    }
}
