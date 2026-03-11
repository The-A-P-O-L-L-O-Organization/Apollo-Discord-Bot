// Discord.js Mocks
// Provides mock implementations for Discord.js objects

import { vi } from 'vitest';

export class MockCollection extends Map {
    constructor(entries) {
        super(entries);
        const getImpl = Map.prototype.get.bind(this);
        this.get = vi.fn((key) => getImpl(key));
    }

    filter(fn) {
        const filtered = new MockCollection();
        for (const [key, value] of this) {
            if (fn(value, key, this)) {
                filtered.set(key, value);
            }
        }
        return filtered;
    }

    find(fn) {
        for (const [key, value] of this) {
            if (fn(value, key, this)) {
                return value;
            }
        }
        return undefined;
    }

    first() {
        return this.values().next().value;
    }

    sort(compareFn) {
        const sortedEntries = [...this.entries()].sort(([, a], [, b]) => compareFn(a, b));
        return new MockCollection(sortedEntries);
    }

    map(fn) {
        const result = [];
        for (const [key, value] of this) {
            result.push(fn(value, key, this));
        }
        return result;
    }
}

function toMockCollection(value) {
    if (value instanceof MockCollection) return value;
    if (value instanceof Map || Array.isArray(value)) return new MockCollection(value);
    return new MockCollection();
}

/**
 * Creates a mock Discord User
 */
export function createMockUser(options = {}) {
    return {
        id: options.id || '123456789012345678',
        username: options.username || 'TestUser',
        tag: options.tag || 'TestUser#0001',
        bot: options.bot || false,
        createdTimestamp: options.createdTimestamp || Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
        displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
        send: vi.fn().mockResolvedValue({}),
        ...options
    };
}

/**
 * Creates a mock Discord GuildMember
 */
export function createMockMember(options = {}) {
    const user = options.user || createMockUser();
    const roleCache = options.roles?.cache
        ? toMockCollection(options.roles.cache)
        : toMockCollection(options.roles);
    const roles = options.roles?.cache
        ? { ...options.roles, cache: roleCache }
        : {
            cache: roleCache,
            has: vi.fn().mockImplementation(roleId => roleCache.has(roleId))
        };
    const permissions = options.permissions?.has
        ? options.permissions
        : {
            has: vi.fn().mockImplementation(perm => {
                return Array.isArray(options.permissions) ? options.permissions.includes(perm) : false;
            })
        };

    return {
        id: user.id,
        user,
        guild: options.guild || createMockGuild(),
        roles,
        permissions,
        bannable: options.bannable !== false,
        kickable: options.kickable !== false,
        moderatable: options.moderatable !== false,
        joinedTimestamp: options.joinedTimestamp || Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 days ago
        timeout: vi.fn().mockResolvedValue({}),
        kick: vi.fn().mockResolvedValue({}),
        ...options
    };
}

/**
 * Creates a mock Discord Guild
 */
export function createMockGuild(options = {}) {
    const {
        channels: channelsOpt,
        members: membersOpt,
        bans: bansOpt,
        ...rest
    } = options;

    const channelCache = channelsOpt?.cache
        ? toMockCollection(channelsOpt.cache)
        : toMockCollection(channelsOpt);
    const channels = channelsOpt?.cache || channelsOpt?.create || channelsOpt?.fetch
        ? {
            ...channelsOpt,
            cache: channelCache,
            fetch: channelsOpt.fetch || vi.fn().mockImplementation(id => Promise.resolve(channelCache.get(id) || null)),
            find: channelsOpt.find || vi.fn().mockImplementation(fn => channelCache.find(fn))
        }
        : {
            cache: channelCache,
            fetch: vi.fn().mockImplementation(id => Promise.resolve(channelCache.get(id) || null)),
            find: vi.fn().mockImplementation(fn => channelCache.find(fn))
        };

    const memberCache = membersOpt?.cache
        ? toMockCollection(membersOpt.cache)
        : toMockCollection(membersOpt);
    const defaultMe = {
        permissions: {
            has: vi.fn().mockReturnValue(true)
        }
    };
    const members = membersOpt?.cache || membersOpt?.fetch || membersOpt?.me
        ? {
            ...membersOpt,
            cache: memberCache,
            fetch: membersOpt.fetch || vi.fn().mockImplementation(id => Promise.resolve(memberCache.get(id) || null)),
            me: membersOpt.me || defaultMe
        }
        : {
            cache: memberCache,
            fetch: vi.fn().mockImplementation(id => Promise.resolve(memberCache.get(id) || null)),
            me: defaultMe
        };

    return {
        id: options.id || '987654321098765432',
        name: options.name || 'Test Server',
        memberCount: options.memberCount || 100,
        iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
        channels,
        members,
        bans: {
            create: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({}),
            ...bansOpt
        },
        ...rest
    };
}

/**
 * Creates a mock Discord TextChannel
 */
export function createMockChannel(options = {}) {
    const id = options.id || '111222333444555666';
    return {
        id,
        name: options.name || 'test-channel',
        type: options.type || 0, // GUILD_TEXT
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn().mockResolvedValue({}),
        toString: vi.fn().mockReturnValue(`<#${id}>`),
        messages: {
            fetch: vi.fn().mockResolvedValue({})
        },
        ...options
    };
}

/**
 * Creates a mock Discord Message
 */
export function createMockMessage(options = {}) {
    const author = options.author || createMockUser();
    const guild = options.guild || createMockGuild();
    const channel = options.channel || createMockChannel();
    
    return {
        id: options.id || '777888999000111222',
        content: options.content || 'Test message',
        author,
        guild,
        channel,
        mentions: {
            users: options.mentionedUsers || new Map(),
            roles: options.mentionedRoles || new Map(),
            everyone: options.mentionEveryone || false
        },
        attachments: options.attachments || new Map(),
        embeds: options.embeds || [],
        url: options.url || 'https://discord.com/channels/123/456/789',
        reactions: {
            cache: options.reactions || new Map()
        },
        delete: vi.fn().mockResolvedValue({}),
        edit: vi.fn().mockResolvedValue({}),
        reply: vi.fn().mockResolvedValue({}),
        ...options
    };
}

/**
 * Creates a mock Discord Interaction (slash command)
 */
export function createMockInteraction(options = {}) {
    const user = options.user || createMockUser();
    const guild = options.guild || createMockGuild();
    const channel = options.channel || createMockChannel();

    const cachePaths = ['channels', 'members', 'roles', 'emojis', 'stickers'];
    for (const path of cachePaths) {
        if (guild[path]?.cache instanceof Map && !(guild[path].cache instanceof MockCollection)) {
            guild[path].cache = toMockCollection(guild[path].cache);
        }
    }
    
    return {
        user,
        guild,
        channel,
        client: options.client || createMockClient(),
        createdTimestamp: options.createdTimestamp || Date.now(),
        options: {
            getUser: vi.fn(),
            getString: vi.fn(),
            getInteger: vi.fn(),
            getBoolean: vi.fn(),
            getChannel: vi.fn(),
            getRole: vi.fn(),
            getMember: vi.fn(),
            getSubcommand: vi.fn(),
            ...options.options
        },
        reply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        followUp: vi.fn().mockResolvedValue({}),
        ...options
    };
}

/**
 * Creates a mock Discord Client
 */
export function createMockClient(options = {}) {
    return {
        user: options.user || createMockUser({ id: 'BOT_ID', tag: 'TestBot#0001', bot: true }),
        ws: {
            ping: options.wsPing || 50
        },
        guilds: {
            cache: toMockCollection(options.guilds),
            fetch: vi.fn()
        },
        channels: {
            cache: toMockCollection(options.channels),
            fetch: vi.fn()
        },
        users: {
            fetch: vi.fn()
        },
        rest: {
            put: vi.fn().mockResolvedValue({})
        },
        config: options.config || {},
        commands: new Map(),
        ...options
    };
}

/**
 * Creates a mock Voice State
 */
export function createMockVoiceState(options = {}) {
    const member = options.member || createMockMember();
    
    return {
        member,
        channel: options.channel || null,
        channelId: options.channel?.id || null,
        guild: options.guild || createMockGuild(),
        ...options
    };
}

/**
 * Creates mock roles collection
 */
export function createRolesCache(roles = []) {
    const cache = new MockCollection();
    roles.forEach(role => cache.set(role.id, role));
    
    return {
        cache,
        has: vi.fn().mockImplementation(id => cache.has(id))
    };
}
