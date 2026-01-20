// Warnings Command Tests
// Tests for the warnings command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import warningsCommand from '../../src/commands/warnings.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild,
    createMockClient 
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getUserData: vi.fn().mockReturnValue([])
}));

import { getUserData } from '../../src/utils/dataStore.js';

describe('Warnings Command', () => {
    let mockInteraction;
    let mockGuild;
    let targetUser;

    beforeEach(() => {
        vi.clearAllMocks();
        
        targetUser = createMockUser({ 
            id: '111222333', 
            tag: 'TargetUser#0001',
            bot: false 
        });
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Moderator#0001' }),
            guild: mockGuild,
            client: createMockClient(),
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getBoolean: vi.fn().mockReturnValue(false)
            }
        });

        getUserData.mockReturnValue([]);
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(warningsCommand.name).toBe('warnings');
        });

        it('should have a description', () => {
            expect(warningsCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(warningsCommand.category).toBe('Moderation');
        });

        it('should require ModerateMembers permission', () => {
            expect(warningsCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(warningsCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(warningsCommand.options).toHaveLength(2);
            
            const userOption = warningsCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(true);
            expect(userOption.type).toBe(6);
            
            const showInactiveOption = warningsCommand.options.find(o => o.name === 'show-inactive');
            expect(showInactiveOption.required).toBe(false);
            expect(showInactiveOption.type).toBe(5);
        });
    });

    describe('execute - No Warnings', () => {
        it('should display no warnings message', async () => {
            getUserData.mockReturnValue([]);
            
            await warningsCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('No Warnings Found');
            expect(replyCall.embeds[0].description).toContain('TargetUser#0001');
        });

        it('should suggest using show-inactive when no active warnings', async () => {
            getUserData.mockReturnValue([]);
            mockInteraction.options.getBoolean.mockReturnValue(false);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('show-inactive:true');
        });

        it('should not suggest show-inactive when already showing inactive', async () => {
            getUserData.mockReturnValue([]);
            mockInteraction.options.getBoolean.mockReturnValue(true);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).not.toContain('show-inactive:true');
        });
    });

    describe('execute - With Warnings', () => {
        const sampleWarnings = [
            {
                id: 'warn-001',
                reason: 'First warning',
                moderatorTag: 'Mod#0001',
                timestamp: Date.now() - 86400000,
                active: true
            },
            {
                id: 'warn-002',
                reason: 'Second warning',
                moderatorTag: 'Mod#0002',
                timestamp: Date.now(),
                active: true
            }
        ];

        it('should display active warnings', async () => {
            getUserData.mockReturnValue(sampleWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('Warnings for TargetUser#0001');
            expect(replyCall.embeds[0].fields.length).toBeGreaterThan(0);
        });

        it('should show correct warning count', async () => {
            getUserData.mockReturnValue(sampleWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('Active Warnings:** 2');
        });

        it('should include warning details', async () => {
            getUserData.mockReturnValue(sampleWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            
            expect(fields.some(f => f.value.includes('warn-001') || f.value.includes('warn-002'))).toBe(true);
            expect(fields.some(f => f.value.includes('First warning') || f.value.includes('Second warning'))).toBe(true);
        });

        it('should include moderator information', async () => {
            getUserData.mockReturnValue(sampleWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            
            expect(fields.some(f => f.value.includes('Mod#0001') || f.value.includes('Mod#0002'))).toBe(true);
        });
    });

    describe('execute - Inactive Warnings', () => {
        const mixedWarnings = [
            {
                id: 'warn-001',
                reason: 'Active warning',
                moderatorTag: 'Mod#0001',
                timestamp: Date.now(),
                active: true
            },
            {
                id: 'warn-002',
                reason: 'Cleared warning',
                moderatorTag: 'Mod#0002',
                timestamp: Date.now() - 86400000,
                active: false
            }
        ];

        it('should hide inactive warnings by default', async () => {
            getUserData.mockReturnValue(mixedWarnings);
            mockInteraction.options.getBoolean.mockReturnValue(false);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('Active Warnings:** 1');
        });

        it('should show inactive warnings when requested', async () => {
            getUserData.mockReturnValue(mixedWarnings);
            mockInteraction.options.getBoolean.mockReturnValue(true);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields.some(f => f.name.includes('[CLEARED]'))).toBe(true);
        });

        it('should show hidden warnings count', async () => {
            getUserData.mockReturnValue(mixedWarnings);
            mockInteraction.options.getBoolean.mockReturnValue(false);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].fields;
            expect(fields.some(f => f.name === 'Hidden Warnings')).toBe(true);
        });
    });

    describe('execute - Pagination', () => {
        it('should limit display to 10 warnings', async () => {
            const manyWarnings = Array.from({ length: 15 }, (_, i) => ({
                id: `warn-${i + 1}`,
                reason: `Warning ${i + 1}`,
                moderatorTag: 'Mod#0001',
                timestamp: Date.now() - i * 86400000,
                active: true
            }));
            getUserData.mockReturnValue(manyWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const warningFields = replyCall.embeds[0].fields.filter(f => f.name.includes('Warning #'));
            expect(warningFields.length).toBeLessThanOrEqual(10);
        });

        it('should show note when more warnings exist', async () => {
            const manyWarnings = Array.from({ length: 15 }, (_, i) => ({
                id: `warn-${i + 1}`,
                reason: `Warning ${i + 1}`,
                moderatorTag: 'Mod#0001',
                timestamp: Date.now() - i * 86400000,
                active: true
            }));
            getUserData.mockReturnValue(manyWarnings);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const noteField = replyCall.embeds[0].fields.find(f => f.name === 'Note');
            expect(noteField).toBeTruthy();
            expect(noteField.value).toContain('15');
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when no user specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR] Missing User');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle database errors gracefully', async () => {
            getUserData.mockImplementation(() => {
                throw new Error('Database error');
            });
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Footer and Metadata', () => {
        it('should include requester in footer', async () => {
            getUserData.mockReturnValue([{
                id: 'warn-001',
                reason: 'Test',
                moderatorTag: 'Mod#0001',
                timestamp: Date.now(),
                active: true
            }]);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].footer.text).toContain('Moderator#0001');
        });

        it('should include user thumbnail', async () => {
            getUserData.mockReturnValue([{
                id: 'warn-001',
                reason: 'Test',
                moderatorTag: 'Mod#0001',
                timestamp: Date.now(),
                active: true
            }]);
            
            await warningsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].thumbnail.url).toBeTruthy();
        });
    });
});
