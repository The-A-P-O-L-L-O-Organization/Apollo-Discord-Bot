// Automod Command Tests
// Tests for the automod configuration command functionality

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { ChatInputCommandInteraction, Guild, TextChannel } from 'discord.js';
import automodCommand from '../../src/plugins/automod/commands/automod.js';
import { i18n } from '../../src/i18n/index.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';
import type { MockCommandInteraction, MockGuild, MockTextChannel } from '../mocks/discord.js';

// Mock the db module
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn().mockReturnValue({ bannedWords: [] as string[] }),
    setGuildData: vi.fn().mockReturnValue({ bannedWords: [] as string[] }),
    updateGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/db.js';

describe('Automod Command', () => {
    let mockInteraction: MockCommandInteraction;
    let mockGuild: MockGuild;

    beforeAll(async () => {
        await i18n.loadNamespaces('automod');
    });

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({ 
            id: '987654321098765432',
            name: 'Test Server'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Admin#0001' }),
            guild: mockGuild,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
                getChannel: vi.fn(),
                getRole: vi.fn()
            }
        }) as unknown as MockCommandInteraction;

        vi.mocked(getGuildData).mockResolvedValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(automodCommand.name).toBe('automod');
        });

        it('should have a description', () => {
            expect(automodCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(automodCommand.category).toBe('Moderation');
        });

        it('should require Administrator permission', () => {
            expect(automodCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(automodCommand.dmPermission).toBe(false);
        });

        it('should have multiple subcommands', () => {
            const subcommands = automodCommand.options.filter((o: { name: string; type: number }) => o.type === 1);
            expect(subcommands.length).toBeGreaterThan(0);
            
            const subcommandNames = subcommands.map(s => s.name);
            expect(subcommandNames).toContain('enable');
            expect(subcommandNames).toContain('disable');
            expect(subcommandNames).toContain('status');
            expect(subcommandNames).toContain('addword');
            expect(subcommandNames).toContain('removeword');
            expect(subcommandNames).toContain('listwords');
            expect(subcommandNames).toContain('set');
        });
    });

    describe('execute - enable subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('enable');
            vi.mocked(getGuildData).mockResolvedValue({});
        });

        it('should enable automod successfully', async() => {
            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                expect.objectContaining({ enabled: true })
            );
        });

        it('should reply with success message', async() => {
            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Automod Enabled');
        });
    });

    describe('execute - disable subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('disable');
            vi.mocked(getGuildData).mockResolvedValue({});
        });

        it('should disable automod successfully', async() => {
            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                expect.objectContaining({ enabled: false })
            );
        });

        it('should reply with success message', async() => {
            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Automod Disabled');
        });
    });

    describe('execute - status subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('status');
        });

        it('should display current configuration', async() => {
            vi.mocked(getGuildData).mockResolvedValue({
                enabled: true,
                bannedWords: ['badword1', 'badword2'],
                filterInvites: true
            });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toBe('Automod Configuration');
        });

        it('should show enabled status when enabled', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ enabled: true });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].description).toContain('Enabled');
        });

        it('should show disabled status when disabled', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ enabled: false });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].description).toContain('Disabled');
        });
    });

    describe('execute - addword subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('addword');
            mockInteraction.options.getString.mockReturnValue('badword');
        });

        it('should add a new banned word', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: [] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['bannedWords']).toContain('badword');
        });

        it('should convert word to lowercase', async() => {
            mockInteraction.options.getString.mockReturnValue('BadWord');
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: [] as string[] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['bannedWords']).toContain('badword');
        });

        it('should reject duplicate words', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: ['badword'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Word Already Banned');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - removeword subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('removeword');
            mockInteraction.options.getString.mockReturnValue('badword');
        });

        it('should remove an existing banned word', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: ['badword', 'other'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['bannedWords']).not.toContain('badword');
        });

        it('should reject removing non-existent word', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: ['other'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Word Not Found');
            expect(replyCall.flags).toBe(64);
        });
    });

    describe('execute - listwords subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('listwords');
        });

        it('should list all banned words', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: ['word1', 'word2'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toBe('Banned Words List');
            expect(replyCall.embeds[0].description).toContain('2');
        });

        it('should handle empty banned words list', async() => {
            vi.mocked(getGuildData).mockResolvedValue({ bannedWords: [] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].description).toContain('No banned words');
        });
    });

    describe('execute - set subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
        });

        it('should set boolean settings', async() => {
            mockInteraction.options.getString
                .mockReturnValueOnce('filterInvites')
                .mockReturnValueOnce('true');
            vi.mocked(getGuildData).mockResolvedValue({});

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                expect.objectContaining({ filterInvites: true })
            );
        });

        it('should set numeric settings', async() => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxMentions')
                .mockReturnValueOnce('10');
            vi.mocked(getGuildData).mockResolvedValue({});

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                expect.objectContaining({ maxMentions: 10 })
            );
        });

        it('should reject invalid number values', async() => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxMentions')
                .mockReturnValueOnce('invalid');

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
            expect(replyCall.flags).toBe(64);
        });

        it('should reject invalid maxCapsPercent range', async() => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxCapsPercent')
                .mockReturnValueOnce('150');

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
        });
    });

    describe('execute - exemptchannel subcommand', () => {
        let mockChannel: MockTextChannel;

        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('exemptchannel');
            mockChannel = createMockChannel({ id: '111222333', name: 'test-channel' });
            mockInteraction.options.getChannel.mockReturnValue(mockChannel);
        });

        it('should add channel exemption', async() => {
            mockInteraction.options.getString.mockReturnValue('add');
            vi.mocked(getGuildData).mockResolvedValue({ exemptChannels: [] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['exemptChannels']).toContain(mockChannel.id);
        });

        it('should remove channel exemption', async() => {
            mockInteraction.options.getString.mockReturnValue('remove');
            vi.mocked(getGuildData).mockResolvedValue({ exemptChannels: ['111222333'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['exemptChannels']).not.toContain(mockChannel.id);
        });

        it('should reject adding already exempt channel', async() => {
            mockInteraction.options.getString.mockReturnValue('add');
            vi.mocked(getGuildData).mockResolvedValue({ exemptChannels: ['111222333'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Already Exempt');
        });
    });

    describe('execute - exemptrole subcommand', () => {
        let mockRole: { id: string; name: string };

        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('exemptrole');
            mockRole = { id: '444555666', name: 'Test Role' };
            mockInteraction.options.getRole.mockReturnValue(mockRole);
        });

        it('should add role exemption', async() => {
            mockInteraction.options.getString.mockReturnValue('add');
            vi.mocked(getGuildData).mockResolvedValue({ exemptRoles: [] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['exemptRoles']).toContain(mockRole.id);
        });

        it('should remove role exemption', async() => {
            mockInteraction.options.getString.mockReturnValue('remove');
            vi.mocked(getGuildData).mockResolvedValue({ exemptRoles: ['444555666'] });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = (vi.mocked(setGuildData).mock.calls[0] as unknown as [string, string, Record<string, unknown>])!;
            expect(setCall[2]['exemptRoles']).not.toContain(mockRole.id);
        });
    });

    describe('execute - Error Handling', () => {
        it('should handle errors gracefully', async() => {
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('Test error');
            });

            await automodCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.embeds[0].title).toContain('Error');
            expect(replyCall.flags).toBe(64);
        });
    });
});
