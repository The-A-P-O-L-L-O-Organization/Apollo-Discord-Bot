// Close Ticket Command Tests
// Tests for the close ticket command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction, Guild, TextChannel } from 'discord.js';
import closeTicketCommand from '../../src/plugins/tickets/commands/closeticket.js';
import {
    createMockInteraction,
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockClient
} from '../mocks/discord.js';
import type { MockClient, MockCommandInteraction, MockGuild, MockGuildMember, MockTextChannel } from '../mocks/discord.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    updateGuildData: vi.fn(),
    writeToSubDir: vi.fn()
}));

// Mock the transcriptGenerator module
vi.mock('../../src/utils/transcriptGenerator.js', () => ({
    saveTranscripts: vi.fn().mockResolvedValue({ htmlFile: 'ticket-1-test.html', textFile: 'ticket-1-test.txt' })
}));

import { getGuildData, updateGuildData } from '../../src/utils/db.js';
import { saveTranscripts } from '../../src/utils/transcriptGenerator.js';

describe('CloseTicket Command', () => {
    let mockInteraction: MockCommandInteraction;
    let mockGuild: MockGuild;
    let mockChannel: MockTextChannel;
    let mockMember: MockGuildMember;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({ 
            id: '111222333',
            name: 'ticket-1-testuser'
        });
        mockChannel.messages = {
            fetch: vi.fn().mockResolvedValue(new Map())
        } as unknown as MockTextChannel['messages'];
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
        } as unknown as MockGuildMember;
        
        const mockClient = createMockClient();
        mockClient.users = {
            fetch: vi.fn().mockResolvedValue(createMockUser({ 
                id: '123456789',
                tag: 'TicketCreator#0001',
                send: vi.fn().mockResolvedValue({})
            }))
        } as unknown as MockClient['users'];
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TicketCreator#0001' }),
            guild: mockGuild,
            channel: mockChannel,
            client: mockClient,
            member: mockMember,
            options: {
                getString: vi.fn().mockReturnValue(null)
            }
        }) as unknown as MockCommandInteraction;
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
        it('should close ticket successfully as ticket owner', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            expect(updateGuildData).toHaveBeenCalled();
            expect(saveTranscripts).toHaveBeenCalled();
        });

        it('should close ticket as admin', async() => {
            mockMember.permissions.has.mockReturnValue(true); // Is admin
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Admin#0001' });

            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('Closing ticket');
        });

        it('should close ticket as support role member', async() => {
            (mockMember.roles.cache as unknown as Map<string, unknown>).set('555666777', { id: '555666777' });
            mockMember.roles.cache.has = vi.fn().mockReturnValue(true);
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Support#0001' });

            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        it('should save transcript', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(saveTranscripts).toHaveBeenCalledWith(
                expect.objectContaining({
                    ticketNumber: '1',
                    guildId: mockGuild.id
                })
            );
        });

        it('should include close reason in transcript', async() => {
            mockInteraction.options.getString.mockReturnValue('Issue resolved');
            
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(saveTranscripts).toHaveBeenCalledWith(
                expect.objectContaining({
                    closeReason: 'Issue resolved'
                })
            );
        });
    });

    describe('execute - Error Cases', () => {
        it('should reject when not in a ticket channel', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '999999999', // Different channel
                    userId: '123456789'
                }]
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('not a ticket channel');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject when no open tickets exist', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: []
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('not a ticket channel');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject when user lacks permission', async() => {
            mockInteraction.user = createMockUser({ id: '999888777', tag: 'Random#0001' });
            mockMember.permissions.has.mockReturnValue(false);
            mockMember.roles.cache.has = vi.fn().mockReturnValue(false);

            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789', // Different user
                    ticketNumber: 1
                }],
                supportRoleId: '555666777'
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.content).toContain('do not have permission');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - Closed Tickets History', () => {
        it('should add ticket to closed tickets history', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 1,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }]
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(updateGuildData).toHaveBeenCalled();
            const callArgs = vi.mocked(updateGuildData).mock.calls[0]!;
            const result = callArgs[2]({ openTickets: [{}], closedTickets: [] }) as unknown as { closedTickets: Array<Record<string, unknown>> };
            expect(result.closedTickets).toBeDefined();
            expect(result.closedTickets.length).toBeGreaterThan(0);
        });

        it('should limit closed tickets history to 100', async() => {
            const closedTickets = Array(100).fill(null).map((_, i) => ({
                ticketNumber: i,
                closedAt: Date.now()
            }));

            vi.mocked(getGuildData).mockResolvedValue({
                openTickets: [{
                    channelId: '111222333',
                    userId: '123456789',
                    ticketNumber: 101,
                    reason: 'Test ticket',
                    createdAt: Date.now()
                }],
                closedTickets
            });

            await closeTicketCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const callArgs = vi.mocked(updateGuildData).mock.calls[0]!;
            const result = callArgs[2]({ openTickets: [{}], closedTickets }) as unknown as { closedTickets: Array<Record<string, unknown>> };
            expect(result.closedTickets.length).toBeLessThanOrEqual(100);
        });
    });
});