// Guild Member Remove Event Tests
// Tests for the guildMemberRemove event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import guildMemberRemoveEvent from '../../src/events/guildMemberRemove.js';
import { 
    createMockMember, 
    createMockUser, 
    createMockGuild,
    createMockClient
} from '../mocks/discord.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createMemberLeaveEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

import { logEvent, createMemberLeaveEmbed } from '../../src/utils/logger.js';

describe('GuildMemberRemove Event', () => {
    let mockMember;
    let mockGuild;
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({ 
                id: '123456789',
                tag: 'LeavingUser#0001',
                bot: false 
            }),
            guild: mockGuild
        });
        
        mockClient = createMockClient();
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(guildMemberRemoveEvent.name).toBe('guildMemberRemove');
        });

        it('should not be a once event', () => {
            expect(guildMemberRemoveEvent.once).toBe(false);
        });
    });

    describe('Success Cases', () => {
        it('should log member leave event for non-bot users', async () => {
            await guildMemberRemoveEvent.execute(mockMember, mockClient);
            
            expect(createMemberLeaveEmbed).toHaveBeenCalledWith(mockMember);
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild, 
                'memberLeave', 
                expect.anything()
            );
        });

        it('should pass the correct guild to logEvent', async () => {
            await guildMemberRemoveEvent.execute(mockMember, mockClient);
            
            expect(logEvent).toHaveBeenCalledWith(
                mockMember.guild,
                'memberLeave',
                expect.anything()
            );
        });
    });

    describe('Bot User Handling', () => {
        it('should not log leave event for bot users', async () => {
            mockMember.user.bot = true;
            
            await guildMemberRemoveEvent.execute(mockMember, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createMemberLeaveEmbed).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle member with minimal data', async () => {
            const minimalMember = createMockMember({
                id: '111222333',
                user: createMockUser({ bot: false }),
                guild: mockGuild
            });
            
            await expect(
                guildMemberRemoveEvent.execute(minimalMember, mockClient)
            ).resolves.not.toThrow();
        });

        it('should handle logging errors gracefully', async () => {
            logEvent.mockRejectedValue(new Error('Logging failed'));
            
            await expect(
                guildMemberRemoveEvent.execute(mockMember, mockClient)
            ).rejects.toThrow('Logging failed');
        });
    });
});
