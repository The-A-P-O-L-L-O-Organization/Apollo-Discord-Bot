// Guild Member Add Event Tests
// Tests for the guildMemberAdd event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GuildMember, Guild, TextChannel } from 'discord.js';
import guildMemberAddHandler from '../../src/plugins/moderation/events/guildMemberAdd.js';
import {
    createMockMember,
    createMockUser,
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';
import type { MockGuildOptions, MockMemberOptions } from '../mocks/discord.js';

// Mock the guildLogging module
vi.mock('../../src/utils/guildLogging.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createMemberJoinEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        database: { type: 'sqlite' },
        welcome: {
            channelName: 'welcome',
            message: 'Welcome {user} to {server}!'
        },
        moderation: {
            moderationLogChannel: 'mod-log'
        },
        automod: {
            useRedisRaidDetection: false,
            useRedisSpamTracking: false
        }
    }
}));

// Mock the raidDetection module
vi.mock('../../src/utils/raidDetection.js', () => ({
    checkRaidPattern: vi.fn().mockReturnValue(false),
    handleRaidDetected: vi.fn()
}));

// Mock analytics
vi.mock('../../src/utils/analyticsCollector.js', () => ({
    trackMemberChange: vi.fn()
}));

import * as mockedLogger from '../../src/utils/guildLogging.js';

const { logEvent, createMemberJoinEmbed } = mockedLogger as unknown as {
    logEvent: ReturnType<typeof vi.fn>;
    createMemberJoinEmbed: ReturnType<typeof vi.fn>;
};

const executeMemberAdd = guildMemberAddHandler.execute as (member: GuildMember) => Promise<void>;

describe('GuildMemberAdd Event', () => {
    let mockMember: GuildMember;
    let mockGuild: Guild;
    let welcomeChannel: TextChannel;
    let channelCache: {
        find: ReturnType<typeof vi.fn>;
        first: ReturnType<typeof vi.fn>;
    };
    let sendMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        sendMock = vi.fn().mockResolvedValue({});
        welcomeChannel = createMockChannel({
            id: '111222333',
            name: 'welcome',
            send: sendMock as unknown as TextChannel['send']
        });

        const channelsCache = new Map();
        channelsCache.set('111222333', welcomeChannel);

        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            memberCount: 100,
            channels: channelsCache as unknown as MockGuildOptions['channels'],
            systemChannel: null
        });

        // Override channels.cache.find to return welcome channel
        channelCache = mockGuild.channels.cache as unknown as typeof channelCache;
        channelCache.find = vi.fn().mockImplementation((fn: (value: unknown) => boolean) => {
            if (fn(welcomeChannel)) {return welcomeChannel;}
            return null;
        });
        channelCache.first = vi.fn().mockReturnValue(welcomeChannel);

        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({
                id: '123456789',
                tag: 'NewUser#0001',
                bot: false
            }) as unknown as MockMemberOptions['user'],
            guild: mockGuild as unknown as MockMemberOptions['guild']
        });
        mockMember.toString = vi.fn().mockReturnValue('<@123456789>') as unknown as () => `<@${string}>`;
    });

    describe('Success Cases', () => {
        it('should log member join event for non-bot users', async() => {
            await executeMemberAdd(mockMember);
            
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild, 
                'memberJoin', 
                expect.anything()
            );
            expect(createMemberJoinEmbed).toHaveBeenCalledWith(mockMember);
        });

        it('should send welcome message to welcome channel', async() => {
            await executeMemberAdd(mockMember);
            
            expect(welcomeChannel.send).toHaveBeenCalled();
            const sendCall = sendMock.mock.calls[0]![0];
            expect(sendCall.content).toContain('<@123456789>');
            expect(sendCall.embeds).toHaveLength(1);
        });

        it('should include correct embed content', async() => {
            await executeMemberAdd(mockMember);
            
            const sendCall = sendMock.mock.calls[0]![0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.title).toBe('Welcome to the Server!');
            expect(embedData.color).toBe(0x00FF00);
        });

        it('should include member details in embed fields', async() => {
            await executeMemberAdd(mockMember);
            
            const sendCall = sendMock.mock.calls[0]![0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            const memberField = embedData.fields.find((f: { name: string; value: string }) => f.name === 'New Member');
            expect(memberField).toBeTruthy();
            expect(memberField.value).toBe('NewUser#0001');
        });

        it('should use system channel when welcome channel not found', async() => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            const systemChannel = createMockChannel({
                id: '999888777',
                name: 'general',
                send: vi.fn().mockResolvedValue({})
            });
            (mockGuild as unknown as { systemChannel: TextChannel | null }).systemChannel = systemChannel;
            
            await executeMemberAdd(mockMember);
            
            expect(systemChannel.send).toHaveBeenCalled();
        });

        it('should skip welcome message when no welcome or system channel', async() => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            (mockGuild as unknown as { systemChannel: TextChannel | null }).systemChannel = null;
            
            await expect(executeMemberAdd(mockMember)).resolves.not.toThrow();
            
            expect(welcomeChannel.send).not.toHaveBeenCalled();
        });
    });

    describe('Bot User Handling', () => {
        it('should not log join event for bot users', async() => {
            mockMember.user.bot = true;
            
            await executeMemberAdd(mockMember);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createMemberJoinEmbed).not.toHaveBeenCalled();
        });

        it('should still send welcome message for bot users', async() => {
            mockMember.user.bot = true;
            
            await executeMemberAdd(mockMember);
            
            expect(welcomeChannel.send).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle no available channel gracefully', async() => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            (mockGuild as unknown as { systemChannel: TextChannel | null }).systemChannel = null;
            mockGuild.channels.cache.first = vi.fn().mockReturnValue(null);
            
            await expect(executeMemberAdd(mockMember)).resolves.not.toThrow();
        });

        it('should handle send message error gracefully', async() => {
            sendMock.mockRejectedValue(new Error('Permission denied'));
            
            await expect(executeMemberAdd(mockMember)).resolves.not.toThrow();
        });
    });

    describe('Welcome Message Formatting', () => {
        it('should replace {user} placeholder in welcome message', async() => {
            await executeMemberAdd(mockMember);
            
            const sendCall = sendMock.mock.calls[0]![0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.description).toContain('<@123456789>');
        });

        it('should replace {server} placeholder in welcome message', async() => {
            await executeMemberAdd(mockMember);
            
            const sendCall = sendMock.mock.calls[0]![0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.description).toContain('Test Server');
        });

        it('should include member count in footer', async() => {
            await executeMemberAdd(mockMember);
            
            const sendCall = sendMock.mock.calls[0]![0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.footer.text).toContain('100');
        });
    });
});
