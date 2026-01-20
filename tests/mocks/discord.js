// Discord.js Mocks
// Provides mock implementations for Discord.js objects

import { vi } from 'vitest';

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
    return {
        id: user.id,
        user,
        guild: options.guild || createMockGuild(),
        roles: {
            cache: options.roles || new Map(),
            has: vi.fn().mockImplementation(roleId => {
                return options.roles?.has(roleId) || false;
            })
        },
        permissions: {
            has: vi.fn().mockImplementation(perm => {
                return options.permissions?.includes(perm) || false;
            })
        },
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
    return {
        id: options.id || '987654321098765432',
        name: options.name || 'Test Server',
        memberCount: options.memberCount || 100,
        iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
        channels: {
            cache: options.channels || new Map(),
            fetch: vi.fn().mockImplementation(id => {
                const channels = options.channels || new Map();
                return Promise.resolve(channels.get(id) || null);
            }),
            find: vi.fn()
        },
        members: {
            cache: options.members || new Map(),
            fetch: vi.fn().mockImplementation(id => {
                const members = options.members || new Map();
                return Promise.resolve(members.get(id) || null);
            })
        },
        bans: {
            create: vi.fn().mockResolvedValue({}),
            remove: vi.fn().mockResolvedValue({})
        },
        ...options
    };
}

/**
 * Creates a mock Discord TextChannel
 */
export function createMockChannel(options = {}) {
    return {
        id: options.id || '111222333444555666',
        name: options.name || 'test-channel',
        type: options.type || 0, // GUILD_TEXT
        isTextBased: vi.fn().mockReturnValue(true),
        send: vi.fn().mockResolvedValue(createMockMessage()),
        messages: {
            fetch: vi.fn().mockResolvedValue(createMockMessage())
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
            cache: options.guilds || new Map(),
            fetch: vi.fn()
        },
        channels: {
            cache: options.channels || new Map(),
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
    const cache = new Map();
    roles.forEach(role => cache.set(role.id, role));
    
    return {
        cache,
        has: vi.fn().mockImplementation(id => cache.has(id))
    };
}
