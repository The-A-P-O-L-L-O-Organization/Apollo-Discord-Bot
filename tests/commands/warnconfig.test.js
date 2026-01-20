// Warn Config Command Tests
// Tests for the warnconfig command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import warnconfigCommand from '../../src/commands/warnconfig.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockGuild 
} from '../mocks/discord.js';

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        warnings: {
            thresholds: {
                mute: 3,
                kick: 5,
                ban: 7
            },
            muteDuration: 3600000
        }
    }
}));

import { getGuildData, setGuildData } from '../../src/utils/dataStore.js';

describe('WarnConfig Command', () => {
    let mockInteraction;
    let mockGuild;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({ 
            id: '987654321',
            name: 'Test Server'
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999888777', tag: 'Admin#0001' }),
            guild: mockGuild,
            options: {
                getSubcommand: vi.fn(),
                getString: vi.fn(),
                getInteger: vi.fn()
            }
        });

        getGuildData.mockReturnValue({});
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(warnconfigCommand.name).toBe('warnconfig');
        });

        it('should have a description', () => {
            expect(warnconfigCommand.description).toBeTruthy();
        });

        it('should be in Moderation category', () => {
            expect(warnconfigCommand.category).toBe('Moderation');
        });

        it('should require Administrator permission', () => {
            expect(warnconfigCommand.defaultMemberPermissions).toBeTruthy();
        });

        it('should not allow DM usage', () => {
            expect(warnconfigCommand.dmPermission).toBe(false);
        });

        it('should have view, set, setmuteduration, and reset subcommands', () => {
            const subcommands = warnconfigCommand.options.map(o => o.name);
            expect(subcommands).toContain('view');
            expect(subcommands).toContain('set');
            expect(subcommands).toContain('setmuteduration');
            expect(subcommands).toContain('reset');
        });
    });

    describe('execute - View Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('view');
        });

        it('should display current configuration', async () => {
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 },
                muteDuration: 3600000
            });

            await warnconfigCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toBe('Warning Configuration');
        });

        it('should show default config when none is set', async () => {
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0].data;
            
            const muteField = embed.fields.find(f => f.name.includes('Mute'));
            expect(muteField.value).toContain('3');
        });

        it('should display disabled thresholds as Disabled', async () => {
            getGuildData.mockReturnValue({
                thresholds: { mute: null, kick: 5, ban: null }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0].data;
            
            const muteField = embed.fields.find(f => f.name.includes('Mute Threshold'));
            expect(muteField.value).toBe('Disabled');
        });

        it('should include server name in description', async () => {
            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0].data;
            expect(embed.description).toContain('Test Server');
        });
    });

    describe('execute - Set Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
        });

        it('should set mute threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('mute');
            mockInteraction.options.getInteger.mockReturnValue(4);
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    thresholds: expect.objectContaining({ mute: 4 })
                })
            );
        });

        it('should set kick threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('kick');
            mockInteraction.options.getInteger.mockReturnValue(6);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    thresholds: expect.objectContaining({ kick: 6 })
                })
            );
        });

        it('should set ban threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('ban');
            mockInteraction.options.getInteger.mockReturnValue(10);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    thresholds: expect.objectContaining({ ban: 10 })
                })
            );
        });

        it('should disable threshold when set to 0', async () => {
            mockInteraction.options.getString.mockReturnValue('mute');
            mockInteraction.options.getInteger.mockReturnValue(0);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    thresholds: expect.objectContaining({ mute: null })
                })
            );
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.description).toContain('disabled');
        });

        it('should reply with success embed', async () => {
            mockInteraction.options.getString.mockReturnValue('mute');
            mockInteraction.options.getInteger.mockReturnValue(4);
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[SUCCESS]');
        });

        it('should reject mute >= kick threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('mute');
            mockInteraction.options.getInteger.mockReturnValue(5);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Mute threshold must be less than kick');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject kick >= ban threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('kick');
            mockInteraction.options.getInteger.mockReturnValue(8);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: 5, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Kick threshold must be less than ban');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject mute >= ban threshold', async () => {
            mockInteraction.options.getString.mockReturnValue('mute');
            mockInteraction.options.getInteger.mockReturnValue(8);
            getGuildData.mockReturnValue({
                thresholds: { mute: 3, kick: null, ban: 7 }
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('Mute threshold must be less than ban');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - SetMuteDuration Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('setmuteduration');
        });

        it('should set mute duration in minutes', async () => {
            mockInteraction.options.getString.mockReturnValue('30m');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    muteDuration: 30 * 60000 // 30 minutes
                })
            );
        });

        it('should set mute duration in hours', async () => {
            mockInteraction.options.getString.mockReturnValue('2h');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    muteDuration: 2 * 3600000 // 2 hours
                })
            );
        });

        it('should set mute duration in days', async () => {
            mockInteraction.options.getString.mockReturnValue('1d');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    muteDuration: 86400000 // 1 day
                })
            );
        });

        it('should set mute duration in weeks', async () => {
            mockInteraction.options.getString.mockReturnValue('1w');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                expect.objectContaining({
                    muteDuration: 604800000 // 1 week
                })
            );
        });

        it('should reply with success embed', async () => {
            mockInteraction.options.getString.mockReturnValue('1h');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[SUCCESS]');
            expect(replyCall.embeds[0].data.description).toContain('1 hour');
        });

        it('should reject invalid duration format', async () => {
            mockInteraction.options.getString.mockReturnValue('invalid');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.embeds[0].description).toContain('valid duration');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should reject duration without unit', async () => {
            mockInteraction.options.getString.mockReturnValue('30');
            getGuildData.mockReturnValue({});

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
        });
    });

    describe('execute - Reset Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('reset');
        });

        it('should reset configuration to defaults', async () => {
            getGuildData.mockReturnValue({
                thresholds: { mute: 10, kick: 15, ban: 20 },
                muteDuration: 86400000
            });

            await warnconfigCommand.execute(mockInteraction);
            
            expect(setGuildData).toHaveBeenCalledWith(
                'warnings-config',
                mockGuild.id,
                {}
            );
        });

        it('should reply with success embed showing defaults', async () => {
            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[SUCCESS]');
            expect(replyCall.embeds[0].data.description).toContain('reset to defaults');
        });

        it('should display default threshold values in response', async () => {
            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0].data;
            
            const muteField = embed.fields.find(f => f.name === 'Auto-Mute');
            const kickField = embed.fields.find(f => f.name === 'Auto-Kick');
            const banField = embed.fields.find(f => f.name === 'Auto-Ban');
            
            expect(muteField.value).toContain('3');
            expect(kickField.value).toContain('5');
            expect(banField.value).toContain('7');
        });
    });

    describe('execute - Error Handling', () => {
        it('should handle errors gracefully', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('view');
            getGuildData.mockImplementation(() => {
                throw new Error('Database error');
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });

        it('should include error message in response', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('view');
            getGuildData.mockImplementation(() => {
                throw new Error('Custom error message');
            });

            await warnconfigCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const errorField = replyCall.embeds[0].fields.find(f => f.name === 'Error');
            expect(errorField.value).toBe('Custom error message');
        });
    });
});
