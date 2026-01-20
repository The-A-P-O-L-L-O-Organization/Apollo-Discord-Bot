// Guild Member Add Event Tests
// Tests for the guildMemberAdd event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import guildMemberAddHandler from '../../src/events/guildMemberAdd.js';
import { 
    createMockMember, 
    createMockUser, 
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createMemberJoinEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        welcome: {
            channelName: 'welcome',
            message: 'Welcome {user} to {server}!'
        }
    }
}));

import { logEvent, createMemberJoinEmbed } from '../../src/utils/logger.js';

describe('GuildMemberAdd Event', () => {
    let mockMember;
    let mockGuild;
    let welcomeChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        welcomeChannel = createMockChannel({
            id: '111222333',
            name: 'welcome',
            send: vi.fn().mockResolvedValue({})
        });
        
        const channelsCache = new Map();
        channelsCache.set('111222333', welcomeChannel);
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            memberCount: 100,
            channels: channelsCache,
            systemChannel: null
        });
        
        // Override channels.cache.find to return welcome channel
        mockGuild.channels.cache.find = vi.fn().mockImplementation(fn => {
            if (fn(welcomeChannel)) return welcomeChannel;
            return null;
        });
        mockGuild.channels.cache.first = vi.fn().mockReturnValue(welcomeChannel);
        
        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({ 
                id: '123456789',
                tag: 'NewUser#0001',
                bot: false 
            }),
            guild: mockGuild
        });
        mockMember.toString = vi.fn().mockReturnValue('<@123456789>');
    });

    describe('Success Cases', () => {
        it('should log member join event for non-bot users', async () => {
            await guildMemberAddHandler(mockMember);
            
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild, 
                'memberJoin', 
                expect.anything()
            );
            expect(createMemberJoinEmbed).toHaveBeenCalledWith(mockMember);
        });

        it('should send welcome message to welcome channel', async () => {
            await guildMemberAddHandler(mockMember);
            
            expect(welcomeChannel.send).toHaveBeenCalled();
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            expect(sendCall.content).toContain('<@123456789>');
            expect(sendCall.embeds).toHaveLength(1);
        });

        it('should include correct embed content', async () => {
            await guildMemberAddHandler(mockMember);
            
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.title).toBe('Welcome to the Server!');
            expect(embedData.color).toBe(0x00FF00);
        });

        it('should include member details in embed fields', async () => {
            await guildMemberAddHandler(mockMember);
            
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            const memberField = embedData.fields.find(f => f.name === 'New Member');
            expect(memberField).toBeTruthy();
            expect(memberField.value).toBe('NewUser#0001');
        });

        it('should use system channel when welcome channel not found', async () => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            const systemChannel = createMockChannel({
                id: '999888777',
                name: 'general',
                send: vi.fn().mockResolvedValue({})
            });
            mockGuild.systemChannel = systemChannel;
            
            await guildMemberAddHandler(mockMember);
            
            expect(systemChannel.send).toHaveBeenCalled();
        });

        it('should use first available channel when no welcome or system channel', async () => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.systemChannel = null;
            const fallbackChannel = createMockChannel({
                id: '444555666',
                name: 'general',
                send: vi.fn().mockResolvedValue({})
            });
            mockGuild.channels.cache.first = vi.fn().mockReturnValue(fallbackChannel);
            
            await guildMemberAddHandler(mockMember);
            
            expect(fallbackChannel.send).toHaveBeenCalled();
        });
    });

    describe('Bot User Handling', () => {
        it('should not log join event for bot users', async () => {
            mockMember.user.bot = true;
            
            await guildMemberAddHandler(mockMember);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createMemberJoinEmbed).not.toHaveBeenCalled();
        });

        it('should still send welcome message for bot users', async () => {
            mockMember.user.bot = true;
            
            await guildMemberAddHandler(mockMember);
            
            expect(welcomeChannel.send).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle no available channel gracefully', async () => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.systemChannel = null;
            mockGuild.channels.cache.first = vi.fn().mockReturnValue(null);
            
            await expect(guildMemberAddHandler(mockMember)).resolves.not.toThrow();
        });

        it('should handle send message error gracefully', async () => {
            welcomeChannel.send.mockRejectedValue(new Error('Permission denied'));
            
            await expect(guildMemberAddHandler(mockMember)).resolves.not.toThrow();
        });
    });

    describe('Welcome Message Formatting', () => {
        it('should replace {user} placeholder in welcome message', async () => {
            await guildMemberAddHandler(mockMember);
            
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.description).toContain('<@123456789>');
        });

        it('should replace {server} placeholder in welcome message', async () => {
            await guildMemberAddHandler(mockMember);
            
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.description).toContain('Test Server');
        });

        it('should include member count in footer', async () => {
            await guildMemberAddHandler(mockMember);
            
            const sendCall = welcomeChannel.send.mock.calls[0][0];
            const embed = sendCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.footer.text).toContain('100');
        });
    });
});
