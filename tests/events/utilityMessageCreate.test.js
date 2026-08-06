// Utility MessageCreate Event Tests
// Tests for the XP-award message handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageCreateEvent from '../../src/plugins/utility/events/messageCreate.js';
import {
    createMockMessage,
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockClient,
    createMockMember
} from '../mocks/discord.js';

vi.mock('../../src/utils/xp.js', () => ({
    getLevelsConfig: vi.fn(),
    isOnCooldown: vi.fn().mockReturnValue(false),
    awardXp: vi.fn().mockResolvedValue({ data: { xp: 20, level: 0, messages: 1 }, leveledUp: false })
}));

import { getLevelsConfig, isOnCooldown, awardXp } from '../../src/utils/xp.js';

describe('Utility MessageCreate Event', () => {
    let mockMessage;
    let mockGuild;
    let mockClient;
    let mockChannel;
    let levelsConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        isOnCooldown.mockReturnValue(false);
        awardXp.mockResolvedValue({ data: { xp: 20, level: 0, messages: 1 }, leveledUp: false });
        
        mockChannel = createMockChannel({
            id: '111222333',
            name: 'general',
            send: vi.fn().mockResolvedValue({ delete: vi.fn() })
        });
        
        mockGuild = createMockGuild({ id: '987654321', name: 'Test Server' });
        mockClient = createMockClient();
        
        const mockMember = createMockMember({ kickable: true, moderatable: true });
        
        mockMessage = createMockMessage({
            id: '777888999',
            content: 'Hello world',
            author: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild,
            channel: mockChannel,
            member: mockMember,
            deletable: true
        });
        
        levelsConfig = {
            enabled: true,
            cooldown: 60000,
            minXp: 15,
            maxXp: 25,
            announceLevelUp: true
        };
        
        getLevelsConfig.mockResolvedValue(levelsConfig);
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageCreateEvent.name).toBe('messageCreate');
        });

        it('should not be a once event', () => {
            expect(messageCreateEvent.once).toBe(false);
        });
    });

    describe('XP Awarding', () => {
        it('should award XP for a normal message', async() => {
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(getLevelsConfig).toHaveBeenCalledWith('987654321');
            expect(awardXp).toHaveBeenCalled();
            expect(awardXp.mock.calls[0][0]).toBe('987654321');
            expect(awardXp.mock.calls[0][1]).toBe('123456789');
            expect(awardXp.mock.calls[0][2]).toBeGreaterThanOrEqual(15);
            expect(awardXp.mock.calls[0][2]).toBeLessThanOrEqual(25);
        });

        it('should ignore DMs', async() => {
            mockMessage.guild = null;
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(awardXp).not.toHaveBeenCalled();
        });

        it('should ignore bot messages', async() => {
            mockMessage.author.bot = true;
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(awardXp).not.toHaveBeenCalled();
        });

        it('should skip when leveling is disabled', async() => {
            levelsConfig.enabled = false;
            getLevelsConfig.mockResolvedValue(levelsConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(awardXp).not.toHaveBeenCalled();
        });

        it('should skip when user is on cooldown', async() => {
            isOnCooldown.mockReturnValue(true);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(awardXp).not.toHaveBeenCalled();
        });

        it('should not announce when level-up announcement is disabled', async() => {
            awardXp.mockResolvedValue({ data: { xp: 120, level: 1, messages: 1 }, leveledUp: true });
            levelsConfig.announceLevelUp = false;
            getLevelsConfig.mockResolvedValue(levelsConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        it('should send a level-up message on level up', async() => {
            awardXp.mockResolvedValue({ data: { xp: 120, level: 1, messages: 1 }, leveledUp: true });
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });
});
