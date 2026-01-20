// Ticket Command Tests
// Tests for the ticket command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ticketCommand from '../../src/commands/ticket.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockClient
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn(),
    generateId: vi.fn().mockReturnValue('ticket-123')
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        tickets: {
            channelPrefix: 'ticket-',
            welcomeMessage: 'Thank you for creating a ticket!'
        }
    }
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('Ticket Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockClient;
    let createdChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        createdChannel = createMockChannel({
            id: '111222333',
            name: 'ticket-1-testuser'
        });
        
        mockGuild = createMockGuild({ 
            id: '987654321',
            name: 'Test Server'
        });
        mockGuild.channels = {
            fetch: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdChannel)
        };
        
        mockClient = createMockClient();
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001', username: 'testuser' }),
            guild: mockGuild,
            client: mockClient,
            options: {
                getString: vi.fn().mockReturnValue(null)
            }
        });

        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(ticketCommand.data.name).toBe('ticket');
        });

        it('should have a description', () => {
            expect(ticketCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(ticketCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should create ticket channel', async () => {
            await ticketCommand.execute(mockInteraction);
            
            expect(mockGuild.channels.create).toHaveBeenCalled();
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.name).toContain('ticket-');
            expect(createCall.name).toContain('testuser');
        });

        it('should reply with ticket link', async () => {
            await ticketCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('ticket has been created');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should send welcome message in ticket', async () => {
            await ticketCommand.execute(mockInteraction);
            
            expect(createdChannel.send).toHaveBeenCalled();
            const sendCall = createdChannel.send.mock.calls[0][0];
            expect(sendCall.embeds).toBeDefined();
            expect(sendCall.components).toBeDefined();
        });

        it('should increment ticket number', async () => {
            getGuildData.mockReturnValue({ totalTickets: 5 });

            await ticketCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].totalTickets).toBe(6);
        });

        it('should save ticket to open tickets', async () => {
            await ticketCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].openTickets).toHaveLength(1);
            expect(setCall[2].openTickets[0].userId).toBe('123456789');
        });

        it('should use provided reason', async () => {
            mockInteraction.options.getString.mockReturnValue('Need help with billing');

            await ticketCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].openTickets[0].reason).toBe('Need help with billing');
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);

            await ticketCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].openTickets[0].reason).toBe('No reason provided');
        });

        it('should use category if configured', async () => {
            const mockCategory = { id: 'category-123' };
            getGuildData.mockReturnValue({ categoryId: 'category-123' });
            mockGuild.channels.fetch.mockResolvedValue(mockCategory);

            await ticketCommand.execute(mockInteraction);
            
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.parent).toBe('category-123');
        });

        it('should mention support role if configured', async () => {
            getGuildData.mockReturnValue({ supportRoleId: '555666777' });

            await ticketCommand.execute(mockInteraction);
            
            const sendCall = createdChannel.send.mock.calls[0][0];
            expect(sendCall.content).toContain('555666777');
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject if user has existing ticket', async () => {
            getGuildData.mockReturnValue({
                openTickets: [{
                    userId: '123456789',
                    channelId: '999888777'
                }]
            });

            await ticketCommand.execute(mockInteraction);
            
            expect(mockGuild.channels.create).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('already have an open ticket');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle channel creation failure', async () => {
            mockGuild.channels.create.mockRejectedValue(new Error('Permission denied'));

            await ticketCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Failed to create');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should handle missing category gracefully', async () => {
            getGuildData.mockReturnValue({ categoryId: 'invalid-category' });
            mockGuild.channels.fetch.mockRejectedValue(new Error('Not found'));

            await ticketCommand.execute(mockInteraction);
            
            // Should still create channel, just without parent
            expect(mockGuild.channels.create).toHaveBeenCalled();
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.parent).toBeNull();
        });
    });

    describe('execute - Permission Overwrites', () => {
        it('should set correct permissions for ticket channel', async () => {
            await ticketCommand.execute(mockInteraction);
            
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.permissionOverwrites).toBeDefined();
            
            // Should deny @everyone
            const everyonePerm = createCall.permissionOverwrites.find(
                p => p.id === mockGuild.id
            );
            expect(everyonePerm).toBeDefined();
            
            // Should allow ticket creator
            const userPerm = createCall.permissionOverwrites.find(
                p => p.id === '123456789'
            );
            expect(userPerm).toBeDefined();
        });

        it('should add support role permissions if configured', async () => {
            getGuildData.mockReturnValue({ supportRoleId: '555666777' });

            await ticketCommand.execute(mockInteraction);
            
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            const supportPerm = createCall.permissionOverwrites.find(
                p => p.id === '555666777'
            );
            expect(supportPerm).toBeDefined();
        });
    });

    describe('execute - Channel Naming', () => {
        it('should sanitize username in channel name', async () => {
            mockInteraction.user.username = 'Test User!@#$';

            await ticketCommand.execute(mockInteraction);
            
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.name).not.toContain('!');
            expect(createCall.name).not.toContain('@');
            expect(createCall.name).not.toContain('#');
            expect(createCall.name).not.toContain('$');
        });

        it('should lowercase channel name', async () => {
            mockInteraction.user.username = 'TESTUSER';

            await ticketCommand.execute(mockInteraction);
            
            const createCall = mockGuild.channels.create.mock.calls[0][0];
            expect(createCall.name).toBe(createCall.name.toLowerCase());
        });
    });
});
