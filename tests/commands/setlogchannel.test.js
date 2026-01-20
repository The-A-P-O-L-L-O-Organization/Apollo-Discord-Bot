// SetLogChannel Command Tests
// Tests for the set log channel command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import setLogChannelCommand from '../../src/commands/setlogchannel.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('SetLogChannel Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'mod-logs'
        });
        
        mockGuild = createMockGuild({ 
            id: '987654321',
            name: 'Test Server'
        });
        mockGuild.members = {
            me: {
                id: 'bot-id'
            }
        };
        mockGuild.channels = {
            fetch: vi.fn().mockResolvedValue(mockChannel)
        };
        
        // Mock permissions
        mockChannel.permissionsFor = vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true)
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'Admin#0001' }),
            guild: mockGuild,
            options: {
                getSubcommand: vi.fn(),
                getChannel: vi.fn().mockReturnValue(mockChannel)
            }
        });

        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(setLogChannelCommand.data.name).toBe('setlogchannel');
        });

        it('should have a description', () => {
            expect(setLogChannelCommand.data.description).toBeTruthy();
        });

        it('should be in admin category', () => {
            expect(setLogChannelCommand.category).toBe('admin');
        });
    });

    describe('execute - set subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
        });

        it('should set log channel successfully', async () => {
            await setLogChannelCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].channelId).toBe('111222333');
        });

        it('should reply with success message', async () => {
            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('set to');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should suggest using /logging command', async () => {
            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('/logging');
        });

        it('should reject channel without send permissions', async () => {
            mockChannel.permissionsFor.mockReturnValue({
                has: vi.fn().mockReturnValue(false)
            });

            await setLogChannelCommand.execute(mockInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain("don't have permission");
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should preserve existing config', async () => {
            getGuildData.mockReturnValue({
                events: { messageDelete: true }
            });

            await setLogChannelCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].events).toEqual({ messageDelete: true });
            expect(setCall[2].channelId).toBe('111222333');
        });
    });

    describe('execute - remove subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('remove');
        });

        it('should remove log channel successfully', async () => {
            getGuildData.mockReturnValue({ channelId: '111222333' });

            await setLogChannelCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].channelId).toBeNull();
        });

        it('should reply with success message', async () => {
            getGuildData.mockReturnValue({ channelId: '111222333' });

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('removed');
            expect(replyCall.content).toContain('disabled');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle no channel configured', async () => {
            getGuildData.mockReturnValue({});

            await setLogChannelCommand.execute(mockInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No logging channel');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - view subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('view');
        });

        it('should show current channel', async () => {
            getGuildData.mockReturnValue({ channelId: '111222333' });

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('111222333');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should suggest /logging status command', async () => {
            getGuildData.mockReturnValue({ channelId: '111222333' });

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('/logging status');
        });

        it('should handle no channel configured', async () => {
            getGuildData.mockReturnValue({});

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('No logging channel');
            expect(replyCall.content).toContain('/setlogchannel set');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle deleted channel', async () => {
            getGuildData.mockReturnValue({ channelId: '999999999' });
            mockGuild.channels.fetch.mockRejectedValue(new Error('Not found'));

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('no longer exists');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle channel returning null', async () => {
            getGuildData.mockReturnValue({ channelId: '999999999' });
            mockGuild.channels.fetch.mockResolvedValue(null);

            await setLogChannelCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('no longer exists');
        });
    });
});
