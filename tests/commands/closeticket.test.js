// Close Ticket Command Tests
// Tests for the close ticket command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import closeTicketCommand from '../../src/commands/closeticket.js';
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
    writeToSubDir: vi.fn()
}));

import { getGuildData, setGuildData, writeToSubDir } from '../../src/utils/dataStore.js';

describe('CloseTicket Command', () => {
    let mockInteraction;
    let mockGuild;
    let mockChannel;
    let mockMember;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'ticket-1-testuser'
        });
        mockChannel.messages = {
            fetch: vi.fn().mockResolvedValue(new Map())
        };
        mockChannel.delete = vi.fn().mockResolvedValue({});
        
        mockGuild = createMockGuild({ 
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMember = {
            roles: {
                cache: new Map()
            },
            permissions: {
                has: vi.fn().mockReturnValue(false)
            }
        };
        
        const mockClient = createMockClient();
        mockClient.users = {
            fetch: vi.fn().mockResolvedValue(createMockUser({ 
                id: '123456789',
                tag: 'TicketCreator#0001',
                send: vi.fn().mockResolvedValue({})
            }))
        };
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TicketCreator#0001' }),
            guild: mockGuild,
            channel: mockChannel,
            client: mockClient,
            member: mockMember,
            options: {
                getString: vi.fn().mockReturnValue(null)
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(closeTicketCommand.data.name).toBe('closeticket');
        });

        it('should have a description', () => {
            expect(closeTicketCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(closeTicketCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should close ticket successfully as ticket owner', async () => {
            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            expect(setGuildData).toHaveBeenCalled();
            expect(writeToSubDir).toHaveBeenCalled();
        });

        it('should close ticket as admin', async () => {
            mockMember.permissions.has.mockReturnValue(true); // Is admin
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Admin#0001' });

            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Closing ticket');
        });

        it('should close ticket as support role member', async () => {
            mockMember.roles.cache.set('555666777', { id: '555666777' });
            mockMember.roles.cache.has = vi.fn().mockReturnValue(true);
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Support#0001' });

            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        it('should save transcript', async () => {
            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(writeToSubDir).toHaveBeenCalledWith(
                'transcripts',
                expect.stringContaining('ticket-1'),
                expect.objectContaining({
                    ticketNumber: 1,
                    guildId: mockGuild.id
                })
            );
        });

        it('should include close reason in transcript', async () => {
            mockInteraction.options.getString.mockReturnValue('Issue resolved');
            
            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(writeToSubDir).toHaveBeenCalledWith(
                'transcripts',
                expect.any(String),
                expect.objectContaining({
                    closeReason: 'Issue resolved'
                })
            );
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when not in a ticket channel', async () => {
            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '999999999', // Different channel
                    userId: '123456789'
                }]
            });

            await closeTicketCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('not a ticket channel');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when no open tickets exist', async () => {
            getGuildData.mockReturnValue({
                openTickets: []
            });

            await closeTicketCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('not a ticket channel');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject when user lacks permission', async () => {
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Random#0001' });
            mockMember.permissions.has.mockReturnValue(false);
            mockMember.roles.cache.has = vi.fn().mockReturnValue(false);

            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789', // Different user
                    ticketNumber: 1
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('do not have permission');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Closed Tickets History', () => {
        it('should add ticket to closed tickets history', async () => {
            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            const config = setCall[2];
            expect(config.closedTickets).toBeDefined();
            expect(config.closedTickets.length).toBeGreaterThan(0);
        });

        it('should limit closed tickets history to 100', async () => {
            const closedTickets = Array(100).fill(null).map((_, i) => ({
                ticketNumber: i,
                closedAt: Date.now()
            }));

            getGuildData.mockReturnValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 101,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                closedTickets
            });

            await closeTicketCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            const config = setCall[2];
            expect(config.closedTickets.length).toBeLessThanOrEqual(100);
        });
    });
});
