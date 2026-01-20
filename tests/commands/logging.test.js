// Logging Command Tests
// Tests for the logging configuration command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import loggingCommand from '../../src/commands/logging.js';
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

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        logging: {
            availableEvents: [
                'messageDelete',
                'messageEdit',
                'memberJoin',
                'memberLeave',
                'roleChanges',
                'voiceChanges'
            ],
            defaultEvents: {
                messageDelete: true,
                messageEdit: true,
                memberJoin: true,
                memberLeave: true,
                roleChanges: true,
                voiceChanges: false
            }
        }
    }
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('Logging Command', () => {
    let mockInteraction;
    let mockGuild;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({ 
            id: '987654321',
            name: 'Test Server'
        });
        mockGuild.channels.fetch = vi.fn().mockResolvedValue(
            createMockChannel({ id: '111222333', name: 'mod-logs' })
        );
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'Admin#0001' }),
            guild: mockGuild,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn()
            }
        });

        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(loggingCommand.data.name).toBe('logging');
        });

        it('should have a description', () => {
            expect(loggingCommand.data.description).toBeTruthy();
        });

        it('should be in admin category', () => {
            expect(loggingCommand.category).toBe('admin');
        });
    });

    describe('execute - enable subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('enable');
        });

        it('should enable a specific event', async () => {
            mockInteraction.options.getString.mockReturnValue('messageDelete');

            await loggingCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].events.messageDelete).toBe(true);
        });

        it('should enable all events', async () => {
            mockInteraction.options.getString.mockReturnValue('all');

            await loggingCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            const events = setCall[2].events;
            
            expect(events.messageDelete).toBe(true);
            expect(events.messageEdit).toBe(true);
            expect(events.memberJoin).toBe(true);
            expect(events.memberLeave).toBe(true);
            expect(events.roleChanges).toBe(true);
            expect(events.voiceChanges).toBe(true);
        });

        it('should reply with success message', async () => {
            mockInteraction.options.getString.mockReturnValue('messageDelete');

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('enabled');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - disable subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('disable');
        });

        it('should disable a specific event', async () => {
            mockInteraction.options.getString.mockReturnValue('messageDelete');
            getGuildData.mockReturnValue({
                events: { messageDelete: true, messageEdit: true }
            });

            await loggingCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].events.messageDelete).toBe(false);
        });

        it('should disable all events', async () => {
            mockInteraction.options.getString.mockReturnValue('all');

            await loggingCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            const events = setCall[2].events;
            
            expect(events.messageDelete).toBe(false);
            expect(events.messageEdit).toBe(false);
            expect(events.memberJoin).toBe(false);
        });

        it('should reply with success message', async () => {
            mockInteraction.options.getString.mockReturnValue('messageDelete');

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('disabled');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - status subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('status');
        });

        it('should display current configuration', async () => {
            getGuildData.mockReturnValue({
                channelId: '111222333',
                events: {
                    messageDelete: true,
                    messageEdit: false
                }
            });

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Logging Configuration');
        });

        it('should show log channel status', async () => {
            getGuildData.mockReturnValue({
                channelId: '111222333'
            });

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            const channelField = embed.fields.find(f => f.name === 'Log Channel');
            expect(channelField.value).toContain('111222333');
        });

        it('should show when channel is not configured', async () => {
            getGuildData.mockReturnValue({});

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            const channelField = embed.fields.find(f => f.name === 'Log Channel');
            expect(channelField.value).toContain('Not configured');
        });

        it('should show event statuses', async () => {
            getGuildData.mockReturnValue({
                events: {
                    messageDelete: true,
                    messageEdit: false
                }
            });

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const deleteField = embed.fields.find(f => f.name === 'Message Delete');
            expect(deleteField.value).toContain('Enabled');
            
            const editField = embed.fields.find(f => f.name === 'Message Edit');
            expect(editField.value).toContain('Disabled');
        });

        it('should handle channel not found', async () => {
            getGuildData.mockReturnValue({
                channelId: '999999999'
            });
            mockGuild.channels.fetch.mockRejectedValue(new Error('Not found'));

            await loggingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            const channelField = embed.fields.find(f => f.name === 'Log Channel');
            expect(channelField.value).toContain('not found');
        });
    });
});
