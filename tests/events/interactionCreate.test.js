// Interaction Create Event Tests
// Tests for the interactionCreate event handler (ticket system buttons)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import interactionCreateEvent from '../../src/events/interactionCreate.js';
import { 
    createMockInteraction,
    createMockUser, 
    createMockGuild,
    createMockChannel,
    createMockClient,
    createMockMember
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn(),
    generateId: vi.fn().mockReturnValue('test-ticket-id'),
    writeToSubDir: vi.fn()
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

import { getGuildData, setGuildData, writeToSubDir } from '../../src/utils/dataStore.js';

describe('InteractionCreate Event', () => {
    let mockInteraction;
    let mockGuild;
    let mockClient;
    let mockChannel;
    let ticketConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({
            id: '111222333',
            name: 'ticket-1-testuser',
            send: vi.fn().mockResolvedValue({}),
            delete: vi.fn().mockResolvedValue({}),
            messages: {
                fetch: vi.fn().mockResolvedValue(new Map())
            }
        });
        
        const createdChannel = createMockChannel({
            id: '444555666',
            name: 'ticket-1-testuser',
            send: vi.fn().mockResolvedValue({})
        });
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            channels: {
                create: vi.fn().mockResolvedValue(createdChannel),
                fetch: vi.fn().mockResolvedValue(null),
                cache: new Map()
            },
            roles: {
                fetch: vi.fn().mockResolvedValue({ name: 'Support' })
            }
        });
        
        mockClient = createMockClient({
            users: {
                fetch: vi.fn().mockResolvedValue(createMockUser({ tag: 'TestUser#0001' }))
            }
        });
        
        const mockMember = createMockMember({
            permissions: {
                has: vi.fn().mockReturnValue(false)
            }
        });
        mockMember.roles = {
            cache: {
                has: vi.fn().mockReturnValue(false)
            }
        };
        
        mockInteraction = {
            isButton: vi.fn().mockReturnValue(true),
            customId: 'create_ticket',
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            guild: mockGuild,
            channel: mockChannel,
            client: mockClient,
            member: mockMember,
            reply: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({}),
            deferReply: vi.fn().mockResolvedValue({})
        };
        
        ticketConfig = {
            openTickets: [],
            totalTickets: 0,
            categoryId: null,
            supportRoleId: null
        };
        
        getGuildData.mockReturnValue(ticketConfig);
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(interactionCreateEvent.name).toBe('interactionCreate');
        });

        it('should not be a once event', () => {
            expect(interactionCreateEvent.once).toBe(false);
        });
    });

    describe('Non-Button Interactions', () => {
        it('should ignore non-button interactions', async () => {
            mockInteraction.isButton.mockReturnValue(false);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });
    });

    describe('Create Ticket Button', () => {
        it('should create a new ticket channel', async () => {
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockGuild.channels.create).toHaveBeenCalled();
        });

        it('should save ticket data', async () => {
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.objectContaining({
                    totalTickets: 1,
                    openTickets: expect.arrayContaining([
                        expect.objectContaining({
                            userId: '123456789',
                            ticketNumber: 1
                        })
                    ])
                })
            );
        });

        it('should reject if user already has open ticket', async () => {
            ticketConfig.openTickets = [{ 
                userId: '123456789', 
                channelId: '999888777' 
            }];
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('already have an open ticket'),
                    ephemeral: true
                })
            );
            expect(mockGuild.channels.create).not.toHaveBeenCalled();
        });

        it('should increment ticket number', async () => {
            ticketConfig.totalTickets = 5;
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.objectContaining({
                    totalTickets: 6
                })
            );
        });

        it('should handle channel creation failure', async () => {
            mockGuild.channels.create.mockRejectedValue(new Error('Permission denied'));
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Failed to create')
                })
            );
        });
    });

    describe('Close Ticket Button', () => {
        beforeEach(() => {
            mockInteraction.customId = 'close_ticket';
            ticketConfig.openTickets = [{
                id: 'test-id',
                ticketNumber: 1,
                channelId: '111222333',
                userId: '123456789',
                reason: 'Test ticket',
                createdAt: Date.now() - 1000
            }];
            getGuildData.mockReturnValue(ticketConfig);
        });

        it('should close ticket if user is ticket owner', async () => {
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should save transcript before closing', async () => {
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(writeToSubDir).toHaveBeenCalledWith(
                'transcripts',
                expect.stringContaining('ticket-1'),
                expect.objectContaining({
                    ticketNumber: 1,
                    guildId: '987654321'
                })
            );
        });

        it('should reject if channel is not a ticket', async () => {
            ticketConfig.openTickets = [];
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not a ticket'),
                    ephemeral: true
                })
            );
        });

        it('should reject if user is not authorized to close', async () => {
            ticketConfig.openTickets[0].userId = 'different-user';
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('do not have permission'),
                    ephemeral: true
                })
            );
        });

        it('should allow admin to close any ticket', async () => {
            ticketConfig.openTickets[0].userId = 'different-user';
            mockInteraction.member.permissions.has = vi.fn().mockReturnValue(true);
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should allow support role to close ticket', async () => {
            ticketConfig.openTickets[0].userId = 'different-user';
            ticketConfig.supportRoleId = 'support-role-id';
            mockInteraction.member.roles.cache.has = vi.fn().mockReturnValue(true);
            getGuildData.mockReturnValue(ticketConfig);
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should update ticket config after closing', async () => {
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.objectContaining({
                    openTickets: [],
                    closedTickets: expect.arrayContaining([
                        expect.objectContaining({
                            ticketNumber: 1,
                            closedBy: '123456789'
                        })
                    ])
                })
            );
        });
    });

    describe('Unknown Button', () => {
        it('should ignore unknown button customIds', async () => {
            mockInteraction.customId = 'unknown_button';
            
            await interactionCreateEvent.execute(mockInteraction, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });
});
