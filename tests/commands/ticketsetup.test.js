// Ticket Setup Command Tests
// Tests for the ticketsetup command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ticketsetupCommand from '../../src/commands/ticketsetup.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn().mockReturnValue({}),
    setGuildData: vi.fn()
}));

// Mock config
vi.mock('../../src/config/config.js', () => ({
    config: {
        tickets: {
            categoryId: null,
            supportRoleId: null
        }
    }
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('Ticket Setup Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockChannel;
    let mockCategory;
    let mockRole;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({
            id: 'channel123',
            name: 'support-panel',
            type: 0, // GuildText
            send: vi.fn().mockResolvedValue({ id: 'panel-message-123' })
        });
        
        mockCategory = createMockChannel({
            id: 'category123',
            name: 'Support Tickets',
            type: 4 // GuildCategory
        });
        
        mockRole = {
            id: 'role123',
            name: 'Support Team',
            toString: () => '<@&role123>'
        };
        
        mockGuild = createMockGuild({
            id: 'guild123',
            channels: {
                fetch: vi.fn().mockResolvedValue(mockCategory)
            },
            roles: {
                fetch: vi.fn().mockResolvedValue(mockRole)
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Admin#0001' }),
            guild: mockGuild,
            options: {
                getSubcommand: vi.fn().mockReturnValue('panel'),
                getChannel: vi.fn().mockReturnValue(mockChannel),
                getString: vi.fn().mockReturnValue(null),
                getRole: vi.fn().mockReturnValue(mockRole)
            }
        });

        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(ticketsetupCommand.data.name).toBe('ticketsetup');
        });

        it('should have a description', () => {
            expect(ticketsetupCommand.data.description).toBeTruthy();
        });

        it('should be in admin category', () => {
            expect(ticketsetupCommand.category).toBe('admin');
        });

        it('should have panel subcommand', () => {
            const subcommands = ticketsetupCommand.data.options.filter(o => o.toJSON().type === 1);
            const panelCmd = subcommands.find(s => s.toJSON().name === 'panel');
            expect(panelCmd).toBeTruthy();
        });

        it('should have category subcommand', () => {
            const subcommands = ticketsetupCommand.data.options.filter(o => o.toJSON().type === 1);
            const categoryCmd = subcommands.find(s => s.toJSON().name === 'category');
            expect(categoryCmd).toBeTruthy();
        });

        it('should have supportrole subcommand', () => {
            const subcommands = ticketsetupCommand.data.options.filter(o => o.toJSON().type === 1);
            const supportroleCmd = subcommands.find(s => s.toJSON().name === 'supportrole');
            expect(supportroleCmd).toBeTruthy();
        });

        it('should have status subcommand', () => {
            const subcommands = ticketsetupCommand.data.options.filter(o => o.toJSON().type === 1);
            const statusCmd = subcommands.find(s => s.toJSON().name === 'status');
            expect(statusCmd).toBeTruthy();
        });
    });

    describe('execute - Panel Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('panel');
        });

        it('should create ticket panel successfully', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockChannel.send).toHaveBeenCalled();
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds).toBeDefined();
            expect(sendCall.components).toBeDefined();
        });

        it('should save panel message ID to data store', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                'guild123',
                expect.objectContaining({
                    panelMessageId: 'panel-message-123',
                    panelChannelId: 'channel123'
                })
            );
        });

        it('should reply with success message', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Ticket panel created');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should use custom title when provided', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'title') return 'Custom Support';
                return null;
            });
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.title).toBe('Custom Support');
        });

        it('should use custom description when provided', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'description') return 'Custom description text';
                return null;
            });
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.description).toBe('Custom description text');
        });

        it('should use default title and description when not provided', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            const sendCall = mockChannel.send.mock.calls[0][0];
            expect(sendCall.embeds[0].data.title).toBe('Support Tickets');
            expect(sendCall.embeds[0].data.description).toContain('Click the button below');
        });

        it('should handle channel send error gracefully', async () => {
            mockChannel.send.mockRejectedValue(new Error('Missing permissions'));
            
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Failed to create the ticket panel');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Category Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('category');
            mockInteraction.options.getChannel.mockReturnValue(mockCategory);
        });

        it('should set ticket category successfully', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                'guild123',
                expect.objectContaining({
                    categoryId: 'category123'
                })
            );
        });

        it('should reply with confirmation', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Ticket category set to');
            expect(replyCall.content).toContain('Support Tickets');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Support Role Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('supportrole');
        });

        it('should set support role successfully', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                'guild123',
                expect.objectContaining({
                    supportRoleId: 'role123'
                })
            );
        });

        it('should reply with confirmation', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Support role set to');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Status Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('status');
        });

        it('should display configuration status with no config', async () => {
            getGuildData.mockReturnValue({});
            
            await ticketsetupCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds[0].data.title).toBe('Ticket System Configuration');
        });

        it('should display configured category', async () => {
            getGuildData.mockReturnValue({
                categoryId: 'category123'
            });
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const categoryField = fields.find(f => f.name === 'Ticket Category');
            expect(categoryField.value).toBe('Support Tickets');
        });

        it('should display configured support role', async () => {
            getGuildData.mockReturnValue({
                supportRoleId: 'role123'
            });
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const roleField = fields.find(f => f.name === 'Support Role');
            expect(roleField.value).toBe('Support Team');
        });

        it('should display panel link when configured', async () => {
            getGuildData.mockReturnValue({
                panelMessageId: 'msg123',
                panelChannelId: 'channel123'
            });
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const panelField = fields.find(f => f.name === 'Ticket Panel');
            expect(panelField.value).toContain('Jump to panel');
        });

        it('should handle category not found', async () => {
            getGuildData.mockReturnValue({
                categoryId: 'deleted-category'
            });
            mockGuild.channels.fetch.mockRejectedValue(new Error('Not found'));
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const categoryField = fields.find(f => f.name === 'Ticket Category');
            expect(categoryField.value).toContain('not found');
        });

        it('should handle role not found', async () => {
            getGuildData.mockReturnValue({
                supportRoleId: 'deleted-role'
            });
            mockGuild.roles.fetch.mockRejectedValue(new Error('Not found'));
            
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const roleField = fields.find(f => f.name === 'Support Role');
            expect(roleField.value).toContain('not found');
        });

        it('should be ephemeral', async () => {
            await ticketsetupCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.ephemeral).toBe(true);
        });
    });
});
