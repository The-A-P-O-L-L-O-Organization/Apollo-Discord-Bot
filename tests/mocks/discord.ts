import { vi } from 'vitest';
import type {
    User,
    Guild,
    GuildMember,
    TextChannel,
    Channel,
    Message,
    Interaction,
    ChatInputCommandInteraction,
    Client,
    VoiceState
} from 'discord.js';

export type MockOptions = Record<string, unknown>;

function getOption<T>(options: MockOptions, key: string, fallback: T): T {
    return (options[key] as T | undefined) || fallback;
}

export type MockFn = ReturnType<typeof vi.fn>;

export type MockUser = User & {
    displayAvatarURL: User['displayAvatarURL'] & MockFn;
    send: User['send'] & MockFn;
    tag: string;
};

export type MockGuildMember = GuildMember & {
    timeout: GuildMember['timeout'] & MockFn;
    kick: GuildMember['kick'] & MockFn;
    ban: GuildMember['ban'] & MockFn;
    isCommunicationDisabled: MockFn;
    bannable: boolean;
    kickable: boolean;
    moderatable: boolean;
    displayColor: number;
    permissions: GuildMember['permissions'] & { has: MockFn };
    roles: GuildMember['roles'] & {
        add: MockFn;
        remove: MockFn;
        fetch: MockFn;
        cache: GuildMember['roles']['cache'] & { has: MockFn; find: MockFn; some: MockFn };
    };
};

export type MockGuild = Guild & {
    bans: Guild['bans'] & { create: MockFn; fetch: MockFn; remove: MockFn };
    channels: Guild['channels'] & {
        create: MockFn;
        fetch: MockFn;
        cache: Guild['channels']['cache'] & { get: MockFn };
    };
    roles: Guild['roles'] & {
        create: MockFn;
        fetch: MockFn;
        cache: Guild['roles']['cache'] & { find: MockFn; get: MockFn; has: MockFn; some: MockFn };
    };
    members: Guild['members'] & { fetch: MockFn };
    bannerURL: Guild['bannerURL'] & MockFn;
};

export type MockTextChannel = TextChannel & {
    send: TextChannel['send'] & MockFn;
    bulkDelete: TextChannel['bulkDelete'] & MockFn;
    messages: TextChannel['messages'] & { fetch: MockFn };
    permissionsFor: MockFn;
    isTextBased: TextChannel['isTextBased'] & MockFn;
};

export type MockMessage = Omit<Message, 'reactions'> & {
    react: Message['react'] & MockFn;
    delete: Message['delete'] & MockFn;
    reactions: unknown;
    url: string;
};

export type MockRole = import('discord.js').Role & { position: number };

export type MockClient = Omit<Client, 'guilds' | 'uptime'> & {
    commands?: unknown;
    stats?: unknown;
    uptime: number;
    guilds: { cache: unknown };
};

export class MockCollection<T = unknown> extends Map<string, T> {
    constructor(entries?: Iterable<readonly [string, T]>) {
        super(entries);
        const getImpl = Map.prototype.get.bind(this);
        this.get = vi.fn((key: string) => getImpl(key)) as Map<string, T>['get'];
    }

    filter(fn: (value: T, key: string, collection: MockCollection<T>) => boolean): MockCollection<T> {
        const filtered = new MockCollection<T>();
        for (const [key, value] of this) {
            if (fn(value, key, this)) {
                filtered.set(key, value);
            }
        }
        return filtered;
    }

    find(fn: (value: T, key: string, collection: MockCollection<T>) => boolean): T | undefined {
        for (const [key, value] of this) {
            if (fn(value, key, this)) {
                return value;
            }
        }
        return undefined;
    }

    first(): T | undefined {
        return this.values().next().value;
    }

    sort(compareFn: (a: T, b: T) => number): MockCollection<T> {
        const sortedEntries = [...this.entries()].sort(([, a], [, b]) => compareFn(a, b));
        return new MockCollection<T>(sortedEntries);
    }

    map<U>(fn: (value: T, key: string, collection: MockCollection<T>) => U): U[] {
        const result: U[] = [];
        for (const [key, value] of this) {
            result.push(fn(value, key, this));
        }
        return result;
    }
}

export function toMockCollection<T = unknown>(value: unknown): MockCollection<T> {
    if (value instanceof MockCollection) { return value as MockCollection<T>; }
    if (value instanceof Map || Array.isArray(value)) { return new MockCollection<T>(value as Iterable<readonly [string, T]>); }
    return new MockCollection<T>();
}

export interface MockUserOptions extends MockOptions {
    id?: string;
    username?: string;
    tag?: string;
    bot?: boolean;
    createdTimestamp?: number;
}

export function createMockUser(options: MockUserOptions = {}): MockUser {
    return {
        id: getOption(options, 'id', '123456789012345678'),
        username: getOption(options, 'username', 'TestUser'),
        tag: getOption(options, 'tag', 'TestUser#0001'),
        bot: getOption(options, 'bot', false),
        createdTimestamp: getOption(options, 'createdTimestamp', Date.now() - (30 * 24 * 60 * 60 * 1000)),
        displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
        send: vi.fn().mockResolvedValue({}),
        ...options
    } as unknown as MockUser;
}

export interface MockMemberOptions extends MockOptions {
    user?: MockUserOptions | User;
    roles?: MockOptions & { cache?: unknown };
    permissions?: (MockOptions & { has?: (perm: string) => boolean }) | string[];
    guild?: MockOptions | Guild;
    bannable?: boolean;
    kickable?: boolean;
    moderatable?: boolean;
    joinedTimestamp?: number;
}

export function createMockMember(options: MockMemberOptions = {}): MockGuildMember {
    const user = options['user'] ?? createMockUser();
    const rolesOpt = options['roles'] as (MockOptions & { cache?: unknown }) | undefined;
    const roleCache = rolesOpt?.['cache']
        ? toMockCollection(rolesOpt['cache'])
        : toMockCollection(rolesOpt);
    const roles = rolesOpt?.['cache']
        ? { ...rolesOpt, cache: roleCache }
        : {
            cache: roleCache,
            has: vi.fn().mockImplementation((roleId: string) => roleCache.has(roleId))
        };
    const permissionsOpt = options['permissions'] as (MockOptions & { has?: (perm: string) => boolean }) | string[] | undefined;
    const permissions = (permissionsOpt as MockOptions)?.['has']
        ? permissionsOpt
        : {
            has: vi.fn().mockImplementation((perm: string) => {
                return Array.isArray(options['permissions']) ? (options['permissions'] as string[]).includes(perm) : false;
            })
        };

    return {
        id: (user as MockOptions)['id'],
        user,
        guild: options['guild'] ?? createMockGuild(),
        roles,
        permissions,
        bannable: options['bannable'] !== false,
        kickable: options['kickable'] !== false,
        moderatable: options['moderatable'] !== false,
        joinedTimestamp: getOption(options, 'joinedTimestamp', Date.now() - (7 * 24 * 60 * 60 * 1000)),
        timeout: vi.fn().mockResolvedValue({}),
        kick: vi.fn().mockResolvedValue({}),
        ...options
    } as unknown as MockGuildMember;
}

export interface MockGuildOptions extends MockOptions {
    id?: string;
    name?: string;
    memberCount?: number;
    channels?: MockOptions & { cache?: unknown; create?: unknown; fetch?: unknown; find?: unknown };
    members?: MockOptions & { cache?: unknown; fetch?: unknown; me?: unknown };
    bans?: MockOptions;
}

export function createMockGuild(options: MockGuildOptions = {}): MockGuild {
    const {
        channels: channelsOpt,
        members: membersOpt,
        bans: bansOpt,
        ...rest
    } = options as MockGuildOptions & {
        channels?: MockOptions & { cache?: unknown; fetch?: (id: string) => Promise<unknown>; find?: (fn: (value: unknown) => boolean) => unknown };
        members?: MockOptions & { cache?: unknown; fetch?: (id: string) => Promise<unknown>; me?: unknown };
        bans?: MockOptions;
    };

    const channelCache = (channelsOpt as MockOptions)?.['cache']
        ? toMockCollection((channelsOpt as MockOptions)['cache'])
        : toMockCollection(channelsOpt);
    const channels = (channelsOpt as MockOptions)?.['cache'] || (channelsOpt as MockOptions)?.['create'] || (channelsOpt as MockOptions)?.['fetch']
        ? {
            ...channelsOpt,
            cache: channelCache,
            fetch: (channelsOpt as { fetch?: (id: string) => Promise<unknown> }).fetch || vi.fn().mockImplementation((id: string) => Promise.resolve(channelCache.get(id) || null)),
            find: (channelsOpt as { find?: (fn: (value: unknown) => boolean) => unknown }).find || vi.fn().mockImplementation((fn: (value: unknown) => boolean) => channelCache.find(fn))
        }
        : {
            cache: channelCache,
            fetch: vi.fn().mockImplementation((id: string) => Promise.resolve(channelCache.get(id) || null)),
            find: vi.fn().mockImplementation((fn: (value: unknown) => boolean) => channelCache.find(fn))
        };

    const memberCache = (membersOpt as MockOptions)?.['cache']
        ? toMockCollection((membersOpt as MockOptions)['cache'])
        : toMockCollection(membersOpt);
    const defaultMe = {
        permissions: {
            has: vi.fn().mockReturnValue(true)
        }
    };
    const members = (membersOpt as MockOptions)?.['cache'] || (membersOpt as MockOptions)?.['fetch'] || (membersOpt as MockOptions)?.['me']
        ? {
            ...membersOpt,
            cache: memberCache,
            fetch: (membersOpt as { fetch?: (id: string) => Promise<unknown> }).fetch || vi.fn().mockImplementation((id: string) => Promise.resolve(memberCache.get(id) || null)),
            me: (membersOpt as { me?: unknown }).me || defaultMe
        }
        : {
            cache: memberCache,
            fetch: vi.fn().mockImplementation((id: string) => Promise.resolve(memberCache.get(id) || null)),
            me: defaultMe
        };

    return {
        id: getOption(options, 'id', '987654321098765432'),
        name: getOption(options, 'name', 'Test Server'),
        memberCount: getOption(options, 'memberCount', 100),
        iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
        channels,
        members,
        bans: {
            create: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
            ...bansOpt
        },
        ...rest
    } as unknown as MockGuild;
}

export interface MockChannelOptions extends MockOptions {
    id?: string;
    name?: string;
    type?: number;
}

export function createMockChannel(options: MockChannelOptions = {}): MockTextChannel {
    const id = getOption(options, 'id', '111222333444555666');
    return {
        id,
        name: getOption(options, 'name', 'test-channel'),
        type: getOption(options, 'type', 0),
        isTextBased: vi.fn().mockReturnValue(true),
        permissionsFor: vi.fn().mockReturnValue({ has: vi.fn().mockReturnValue(true) }),
        send: vi.fn().mockResolvedValue({}),
        toString: vi.fn().mockReturnValue(`<#${id}>`),
        messages: {
            fetch: vi.fn().mockResolvedValue({})
        },
        ...options
    } as unknown as MockTextChannel;
}

export interface MockMessageOptions extends MockOptions {
    id?: string;
    content?: string;
    author?: MockUserOptions | User;
    guild?: MockGuildOptions | Guild;
    channel?: MockChannelOptions | Channel;
    mentionedUsers?: Map<string, unknown>;
    mentionedRoles?: Map<string, unknown>;
    mentionEveryone?: boolean;
    attachments?: Map<string, unknown>;
    embeds?: unknown[];
    url?: string;
    reactions?: Map<string, unknown>;
}

export function createMockMessage(options: MockMessageOptions = {}): MockMessage {
    const author = options['author'] ?? createMockUser();
    const guild = options['guild'] ?? createMockGuild();
    const channel = options['channel'] ?? createMockChannel();

    return {
        id: getOption(options, 'id', '777888999000111222'),
        content: getOption(options, 'content', 'Test message'),
        author,
        guild,
        channel,
        mentions: {
            users: options['mentionedUsers'] ?? new Map(),
            roles: options['mentionedRoles'] ?? new Map(),
            everyone: options['mentionEveryone'] ?? false
        },
        attachments: options['attachments'] ?? new Map(),
        embeds: options['embeds'] ?? [],
        url: getOption(options, 'url', 'https://discord.com/channels/123/456/789'),
        reactions: {
            cache: options['reactions'] ?? new Map()
        },
        delete: vi.fn().mockResolvedValue({}),
        edit: vi.fn().mockResolvedValue({}),
        reply: vi.fn().mockResolvedValue({}),
        ...options
    } as unknown as MockMessage;
}

export interface MockInteractionOptions extends MockOptions {
    user?: MockUserOptions | User;
    guild?: MockGuildOptions | Guild;
    channel?: MockChannelOptions | Channel;
    client?: MockOptions | Client;
    member?: MockMemberOptions | GuildMember;
    createdTimestamp?: number;
    options?: MockOptions;
}

export function createMockInteraction(options: MockInteractionOptions = {}): Interaction {
    const user = options['user'] ?? createMockUser();
    const guild = (options['guild'] ?? createMockGuild()) as unknown as MockOptions & Record<string, { cache?: unknown }>;
    const channel = options['channel'] ?? createMockChannel();

    const cachePaths = ['channels', 'members', 'roles', 'emojis', 'stickers'];
    for (const path of cachePaths) {
        if (guild[path]?.['cache'] instanceof Map && !(guild[path]?.['cache'] instanceof MockCollection)) {
            guild[path]['cache'] = toMockCollection(guild[path]?.['cache']);
        }
    }

    return {
        user,
        guild,
        channel,
        client: options['client'] ?? createMockClient(),
        createdTimestamp: getOption(options, 'createdTimestamp', Date.now()),
        options: {
            getUser: vi.fn(),
            getString: vi.fn(),
            getInteger: vi.fn(),
            getBoolean: vi.fn(),
            getChannel: vi.fn(),
            getRole: vi.fn(),
            getMember: vi.fn(),
            getSubcommand: vi.fn(),
            getAttachment: vi.fn(),
            getMessage: vi.fn(),
            ...(options['options'] as MockOptions | undefined)
        },
        reply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        followUp: vi.fn().mockResolvedValue({}),
        ...options
    } as unknown as Interaction;
}

export type InteractionMockFn = ReturnType<typeof vi.fn>;

export interface MockCommandInteractionOptionMocks {
    getUser: InteractionMockFn;
    getString: InteractionMockFn;
    getInteger: InteractionMockFn;
    getBoolean: InteractionMockFn;
    getChannel: InteractionMockFn;
    getRole: InteractionMockFn;
    getMember: InteractionMockFn;
    getSubcommand: InteractionMockFn;
    getAttachment: InteractionMockFn;
    getMessage: InteractionMockFn;
}

export type MockCommandInteraction = Omit<ChatInputCommandInteraction, 'options' | 'reply' | 'editReply' | 'deferReply' | 'followUp' | 'guild' | 'createdTimestamp' | 'user'> & {
    options: MockCommandInteractionOptionMocks & Record<string, InteractionMockFn>;
    reply: InteractionMockFn;
    editReply: InteractionMockFn;
    deferReply: InteractionMockFn;
    followUp: InteractionMockFn;
    awaitMessageComponent: InteractionMockFn;
    guild: MockGuild | null;
    createdTimestamp: number;
    user: MockUser;
};

export interface MockClientOptions extends MockOptions {
    user?: MockUserOptions | User;
    wsPing?: number;
    guilds?: unknown;
    channels?: unknown;
    config?: MockOptions;
}

export function createMockClient(options: MockClientOptions = {}): MockClient {
    return {
        user: options['user'] ?? createMockUser({ id: 'BOT_ID', tag: 'TestBot#0001', bot: true }),
        ws: {
            ping: getOption(options, 'wsPing', 50)
        },
        guilds: {
            cache: toMockCollection(options['guilds']),
            fetch: vi.fn()
        },
        channels: {
            cache: toMockCollection(options['channels']),
            fetch: vi.fn()
        },
        users: {
            fetch: vi.fn()
        },
        rest: {
            put: vi.fn().mockResolvedValue({})
        },
        config: options['config'] ?? {},
        commands: new Map(),
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        ...options
    } as unknown as MockClient;
}

export interface MockVoiceStateOptions extends MockOptions {
    member?: MockMemberOptions | GuildMember | null;
    channel?: MockChannelOptions | Channel | null;
    guild?: MockGuildOptions | Guild | null;
}

export function createMockVoiceState(options: MockVoiceStateOptions = {}): VoiceState {
    const member = options['member'] ?? createMockMember();

    return {
        member,
        channel: options['channel'] ?? null,
        channelId: (options['channel'] as MockChannelOptions | null | undefined)?.['id'] ?? null,
        guild: options['guild'] ?? createMockGuild(),
        ...options
    } as unknown as VoiceState;
}

export function createRolesCache(roles: Array<{ id: string }> = []): { cache: MockCollection<{ id: string }>; has: (id: string) => boolean } {
    const cache = new MockCollection<{ id: string }>();
    roles.forEach((role) => cache.set(role.id, role));

    return {
        cache,
        has: vi.fn().mockImplementation((id: string) => cache.has(id))
    };
}
