// Interaction Create Event Tests
// Tests for the interactionCreate event handler (ticket system buttons)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User, Guild, TextChannel, GuildMember, Client, ButtonInteraction } from 'discord.js';
import interactionCreateEvent from '../../src/plugins/tickets/events/interactionCreate.js';
import {
    createMockUser,
    createMockGuild,
    createMockChannel,
    createMockClient,
    createMockMember
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    updateGuildData: vi.fn(),
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

import * as mockedDb from '../../src/utils/db.js';

const { getGuildData, updateGuildData, writeToSubDir } = mockedDb as unknown as {
    getGuildData: ReturnType<typeof vi.fn>;
    updateGuildData: ReturnType<typeof vi.fn>;
    writeToSubDir: ReturnType<typeof vi.fn>;
};

import { MessageFlags } from 'discord.js';

interface MockTicketInteraction {
    isButton: ReturnType<typeof vi.fn>;
    customId: string;
    user: User;
    guild: Guild;
    channel: TextChannel;
    client: Client;
    member: GuildMember;
    reply: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
    deferReply: ReturnType<typeof vi.fn>;
}

interface TicketEntry {
    id?: string;
    ticketNumber?: number;
    channelId: string;
    userId: string;
    reason?: string;
    createdAt?: number;
}

const executeInteraction = interactionCreateEvent.execute as unknown as (
    interaction: MockTicketInteraction,
    client: Client
) => Promise<void>;

describe('InteractionCreate Event', () => {
    let mockInteraction: MockTicketInteraction;
    let mockGuild: Guild;
    let mockClient: Client;
    let mockChannel: TextChannel;
    let ticketConfig: {
        openTickets: TicketEntry[];
        totalTickets: number;
        categoryId: string | null;
        supportRoleId: string | null;
    };
    let channelCreateMock: ReturnType<typeof vi.fn>;
    let channelSendMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        channelSendMock = vi.fn().mockResolvedValue({});
        mockChannel = createMockChannel({
            id: '111222333',
            name: 'ticket-1-testuser',
            send: channelSendMock as unknown as TextChannel['send'],
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

        channelCreateMock = vi.fn().mockResolvedValue(createdChannel);
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            channels: {
                create: channelCreateMock,
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
        }) as unknown as Client;
        
        const mockMember = createMockMember({
            permissions: {
                has: vi.fn().mockReturnValue(false)
            }
        });
        (mockMember as unknown as { roles: unknown }).roles = {
            cache: {
                has: vi.fn().mockReturnValue(false)
            }
        } as unknown as GuildMember['roles'];
        
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
        } as MockTicketInteraction;
        
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
        it('should ignore non-button interactions', async() => {
            mockInteraction.isButton.mockReturnValue(false);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
            expect(mockInteraction.reply).not.toHaveBeenCalled();
        });
    });

    describe('Create Ticket Button', () => {
        it('should create a new ticket channel', async() => {
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(mockGuild.channels.create).toHaveBeenCalled();
        });

        it('should save ticket data', async() => {
            await executeInteraction(mockInteraction, mockClient);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.any(Function)
            );
        });

        it('should reject if user already has open ticket', async() => {
            ticketConfig.openTickets = [{ 
                userId: '123456789', 
                channelId: '999888777' 
            }];
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('already have an open ticket'),
                    flags: MessageFlags.Ephemeral
                })
            );
            expect(mockGuild.channels.create).not.toHaveBeenCalled();
        });

        it('should increment ticket number', async() => {
            ticketConfig.totalTickets = 5;
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.any(Function)
            );
        });

        it('should handle channel creation failure', async() => {
            channelCreateMock.mockRejectedValue(new Error('Permission denied'));
            
            await executeInteraction(mockInteraction, mockClient);
            
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

        it('should close ticket if user is ticket owner', async() => {
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should save transcript before closing', async() => {
            await executeInteraction(mockInteraction, mockClient);
            
            expect(writeToSubDir).toHaveBeenCalledWith(
                'transcripts',
                expect.stringContaining('ticket-1'),
                expect.objectContaining({
                    ticketNumber: 1,
                    guildId: '987654321'
                })
            );
        });

        it('should reject if channel is not a ticket', async() => {
            ticketConfig.openTickets = [];
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not a ticket'),
                    flags: MessageFlags.Ephemeral
                })
            );
        });

        it('should reject if user is not authorized to close', async() => {
            ticketConfig.openTickets[0]!.userId = 'different-user';
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('do not have permission'),
                    flags: MessageFlags.Ephemeral
                })
            );
        });

        it('should allow admin to close any ticket', async() => {
            ticketConfig.openTickets[0]!.userId = 'different-user';
            (mockInteraction.member.permissions as unknown as { has: unknown }).has = vi.fn().mockReturnValue(true);
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should allow support role to close ticket', async() => {
            ticketConfig.openTickets[0]!.userId = 'different-user';
            ticketConfig.supportRoleId = 'support-role-id';
            mockInteraction.member.roles.cache.has = vi.fn().mockReturnValue(true);
            getGuildData.mockReturnValue(ticketConfig);
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Closing ticket')
                })
            );
        });

        it('should update ticket config after closing', async() => {
            await executeInteraction(mockInteraction, mockClient);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'tickets',
                '987654321',
                expect.any(Function)
            );
        });
    });

    describe('Unknown Button', () => {
        it('should ignore unknown button customIds', async() => {
            mockInteraction.customId = 'unknown_button';
            
            await executeInteraction(mockInteraction, mockClient);
            
            expect(getGuildData).not.toHaveBeenCalled();
        });
    });
});
