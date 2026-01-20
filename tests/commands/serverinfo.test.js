// Server Info Command Tests
// Tests for the server info command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import serverInfoCommand from '../../src/commands/serverinfo.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockGuild,
    createMockMember
} from '../mocks/discord.js';
import { ChannelType } from 'discord.js';

describe('ServerInfo Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockOwner;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock channels
        const mockChannels = new Map();
        mockChannels.set('1', { id: '1', type: ChannelType.GuildText });
        mockChannels.set('2', { id: '2', type: ChannelType.GuildText });
        mockChannels.set('3', { id: '3', type: ChannelType.GuildVoice });
        mockChannels.set('4', { id: '4', type: ChannelType.GuildCategory });
        
        // Create mock members
        const mockMembers = new Map();
        mockMembers.set('1', createMockMember({ user: createMockUser({ bot: false }) }));
        mockMembers.set('2', createMockMember({ user: createMockUser({ bot: true }) }));
        
        // Create mock roles
        const mockRoles = new Map();
        mockRoles.set('1', { id: '1', name: 'Role 1' });
        mockRoles.set('2', { id: '2', name: 'Role 2' });
        
        // Create mock emojis
        const mockEmojis = new Map();
        mockEmojis.set('1', { id: '1', name: 'emoji1' });
        
        // Create mock stickers
        const mockStickers = new Map();
        
        mockOwner = createMockMember({
            user: createMockUser({ id: 'owner-id', tag: 'Owner#0001' })
        });
        
        mockGuild = {
            id: '987654321',
            name: 'Test Server',
            memberCount: 100,
            createdTimestamp: Date.now() - (365 * 24 * 60 * 60 * 1000), // 1 year ago
            premiumTier: 2,
            premiumSubscriptionCount: 10,
            verificationLevel: 2,
            explicitContentFilter: 1,
            description: 'A test server',
            iconURL: vi.fn().mockReturnValue('https://example.com/icon.png'),
            bannerURL: vi.fn().mockReturnValue(null),
            fetch: vi.fn().mockResolvedValue({}),
            fetchOwner: vi.fn().mockResolvedValue(mockOwner),
            channels: {
                cache: mockChannels
            },
            members: {
                cache: mockMembers
            },
            roles: {
                cache: mockRoles
            },
            emojis: {
                cache: mockEmojis
            },
            stickers: {
                cache: mockStickers
            }
        };
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            guild: mockGuild
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(serverInfoCommand.data.name).toBe('serverinfo');
        });

        it('should have a description', () => {
            expect(serverInfoCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(serverInfoCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should display server information', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Test Server');
        });

        it('should fetch latest guild data', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            expect(mockGuild.fetch).toHaveBeenCalled();
        });

        it('should fetch owner information', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            expect(mockGuild.fetchOwner).toHaveBeenCalled();
        });

        it('should show member counts', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const membersField = embed.fields.find(f => f.name.includes('Members'));
            expect(membersField).toBeDefined();
            expect(membersField.value).toContain('Humans');
            expect(membersField.value).toContain('Bots');
        });

        it('should show channel counts', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const channelsField = embed.fields.find(f => f.name.includes('Channels'));
            expect(channelsField).toBeDefined();
            expect(channelsField.value).toContain('Text');
            expect(channelsField.value).toContain('Voice');
        });

        it('should show boost status', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const boostField = embed.fields.find(f => f.name.includes('Boost'));
            expect(boostField).toBeDefined();
            expect(boostField.value).toContain('Level');
            expect(boostField.value).toContain('2');
        });

        it('should show security settings', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const securityField = embed.fields.find(f => f.name.includes('Security'));
            expect(securityField).toBeDefined();
            expect(securityField.value).toContain('Verification');
            expect(securityField.value).toContain('Content Filter');
        });

        it('should show owner information', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('Owner#0001');
        });

        it('should show creation date', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('<t:');
        });

        it('should show role and emoji counts', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const otherField = embed.fields.find(f => f.name === 'Other');
            expect(otherField).toBeDefined();
            expect(otherField.value).toContain('Roles');
            expect(otherField.value).toContain('Emojis');
        });
    });

    describe('execute - Optional Features', () => {
        it('should show description if available', async () => {
            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.description).toBe('A test server');
        });

        it('should not show description if not set', async () => {
            mockGuild.description = null;

            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.description).toBeFalsy();
        });

        it('should show banner if available', async () => {
            mockGuild.bannerURL.mockReturnValue('https://example.com/banner.png');

            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.image).toBeDefined();
        });

        it('should not show banner if not set', async () => {
            mockGuild.bannerURL.mockReturnValue(null);

            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.image).toBeFalsy();
        });
    });

    describe('execute - Verification Levels', () => {
        it('should display correct verification level names', async () => {
            mockGuild.verificationLevel = 4;

            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const securityField = embed.fields.find(f => f.name.includes('Security'));
            expect(securityField.value).toContain('Highest');
        });
    });

    describe('execute - Content Filter Levels', () => {
        it('should display correct content filter names', async () => {
            mockGuild.explicitContentFilter = 2;

            await serverInfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const securityField = embed.fields.find(f => f.name.includes('Security'));
            expect(securityField.value).toContain('All members');
        });
    });
});
