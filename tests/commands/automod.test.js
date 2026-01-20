// Automod Command Tests
// Tests for the automod configuration command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import automodCommand from '../../src/commands/automod.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild,
    createMockChannel
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn().mockReturnValue({}),
    setGuildData: vi.fn(),
    updateGuildData: vi.fn()
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        automod: {
            enabled: false,
            filterInvites: true,
            filterLinks: false,
            maxMentions: 5,
            maxCapsPercent: 70,
            minAccountAge: 0,
            spamThreshold: 5,
            spamInterval: 5000
        }
    }
}));

import { getGuildData, setGuildData, updateGuildData } from '../../src/utils/dataStore.js';

describe('Automod Command', () => {
    let mockInteraction;
    let mockGuild;

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
        });

        getGuildData.mockReturnValue({});
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
            const subcommands = automodCommand.options.filter(o => o.type === 1);
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
        });

        it('should enable automod successfully', async () => {
            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                'enabled',
                true
            );
        });

        it('should reply with success message', async () => {
            await automodCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Automod Enabled');
        });
    });

    describe('execute - disable subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('disable');
        });

        it('should disable automod successfully', async () => {
            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                'enabled',
                false
            );
        });

        it('should reply with success message', async () => {
            await automodCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Automod Disabled');
        });
    });

    describe('execute - status subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('status');
        });

        it('should display current configuration', async () => {
            getGuildData.mockReturnValue({
                enabled: true,
                bannedWords: ['badword1', 'badword2'],
                filterInvites: true
            });

            await automodCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('Automod Configuration');
        });

        it('should show enabled status when enabled', async () => {
            getGuildData.mockReturnValue({ enabled: true });

            await automodCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('Enabled');
        });

        it('should show disabled status when disabled', async () => {
            getGuildData.mockReturnValue({ enabled: false });

            await automodCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('Disabled');
        });
    });

    describe('execute - addword subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('addword');
            mockInteraction.options.getString.mockReturnValue('badword');
        });

        it('should add a new banned word', async () => {
            getGuildData.mockReturnValue({ bannedWords: [] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].bannedWords).toContain('badword');
        });

        it('should convert word to lowercase', async () => {
            mockInteraction.options.getString.mockReturnValue('BadWord');
            getGuildData.mockReturnValue({ bannedWords: [] });

            await automodCommand.execute(mockInteraction);
            
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].bannedWords).toContain('badword');
        });

        it('should reject duplicate words', async () => {
            getGuildData.mockReturnValue({ bannedWords: ['badword'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Already Banned');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - removeword subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('removeword');
            mockInteraction.options.getString.mockReturnValue('badword');
        });

        it('should remove an existing banned word', async () => {
            getGuildData.mockReturnValue({ bannedWords: ['badword', 'other'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].bannedWords).not.toContain('badword');
        });

        it('should reject removing non-existent word', async () => {
            getGuildData.mockReturnValue({ bannedWords: ['other'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Word Not Found');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - listwords subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('listwords');
        });

        it('should list all banned words', async () => {
            getGuildData.mockReturnValue({ bannedWords: ['word1', 'word2'] });

            await automodCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toBe('Banned Words List');
            expect(replyCall.embeds[0].description).toContain('2');
        });

        it('should handle empty banned words list', async () => {
            getGuildData.mockReturnValue({ bannedWords: [] });

            await automodCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].description).toContain('No banned words');
        });
    });

    describe('execute - set subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
        });

        it('should set boolean settings', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('filterInvites')
                .mockReturnValueOnce('true');

            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                'filterInvites',
                true
            );
        });

        it('should set numeric settings', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxMentions')
                .mockReturnValueOnce('10');

            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).toHaveBeenCalledWith(
                'automod',
                mockGuild.id,
                'maxMentions',
                10
            );
        });

        it('should reject invalid number values', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxMentions')
                .mockReturnValueOnce('invalid');

            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject invalid maxCapsPercent range', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('maxCapsPercent')
                .mockReturnValueOnce('150');

            await automodCommand.execute(mockInteraction);
            
            expect(updateGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Value');
        });
    });

    describe('execute - exemptchannel subcommand', () => {
        let mockChannel;

        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('exemptchannel');
            mockChannel = createMockChannel({ id: '111222333', name: 'test-channel' });
            mockInteraction.options.getChannel.mockReturnValue(mockChannel);
        });

        it('should add channel exemption', async () => {
            mockInteraction.options.getString.mockReturnValue('add');
            getGuildData.mockReturnValue({ exemptChannels: [] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].exemptChannels).toContain(mockChannel.id);
        });

        it('should remove channel exemption', async () => {
            mockInteraction.options.getString.mockReturnValue('remove');
            getGuildData.mockReturnValue({ exemptChannels: ['111222333'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].exemptChannels).not.toContain(mockChannel.id);
        });

        it('should reject adding already exempt channel', async () => {
            mockInteraction.options.getString.mockReturnValue('add');
            getGuildData.mockReturnValue({ exemptChannels: ['111222333'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Already Exempt');
        });
    });

    describe('execute - exemptrole subcommand', () => {
        let mockRole;

        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('exemptrole');
            mockRole = { id: '444555666', name: 'Test Role' };
            mockInteraction.options.getRole.mockReturnValue(mockRole);
        });

        it('should add role exemption', async () => {
            mockInteraction.options.getString.mockReturnValue('add');
            getGuildData.mockReturnValue({ exemptRoles: [] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].exemptRoles).toContain(mockRole.id);
        });

        it('should remove role exemption', async () => {
            mockInteraction.options.getString.mockReturnValue('remove');
            getGuildData.mockReturnValue({ exemptRoles: ['444555666'] });

            await automodCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalled();
            const setCall = setGuildData.mock.calls[0];
            expect(setCall[2].exemptRoles).not.toContain(mockRole.id);
        });
    });

    describe('execute - Error Handling', () => {
        it('should handle errors gracefully', async () => {
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('Test error');
            });

            await automodCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });
});
