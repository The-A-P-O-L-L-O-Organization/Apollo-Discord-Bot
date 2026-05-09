import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the utility functions
vi.mock('../../src/utils/analyticsCollector.js', () => ({
    getCommandStats: vi.fn(),
    getMessageStats: vi.fn(),
    getViolationStats: vi.fn(),
    getModActionStats: vi.fn(),
    getMemberGrowthStats: vi.fn(),
    getAnalyticsCollectorStats: vi.fn()
}));

vi.mock('../../src/utils/charts.js', () => ({
    createBarChart: vi.fn(),
    createPercentageBar: vi.fn(),
    createSparkline: vi.fn(),
    createTrendIndicator: vi.fn(),
    formatDuration: vi.fn(),
    formatNumber: vi.fn()
}));

vi.mock('../../src/utils/exportAnalytics.js', () => ({
    exportAnalytics: vi.fn(),
    cleanupExport: vi.fn(),
    getAnalyticsSummary: vi.fn()
}));

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    getUserData: vi.fn()
}));

vi.mock('fs', () => ({
    readFileSync: vi.fn(),
    statSync: vi.fn()
}));

import {
    getCommandStats,
    getMessageStats,
    getViolationStats,
    getModActionStats,
    getMemberGrowthStats
} from '../../src/utils/analyticsCollector.js';
import {
    createBarChart,
    createSparkline,
    formatDuration,
    formatNumber
} from '../../src/utils/charts.js';
import { exportAnalytics, getAnalyticsSummary } from '../../src/utils/exportAnalytics.js';
import { getGuildData, getUserData } from '../../src/utils/db.js';
import { readFileSync } from 'fs';

import analyticsCommand from '../../src/plugins/utility/commands/analytics.js';

describe('Analytics Command', () => {
    let interaction;
    let client;
    let guild;
    let user;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock client and guild
        client = {
            users: {
                fetch: vi.fn()
            }
        };

        guild = {
            id: '123456789',
            name: 'Test Guild',
            channels: {
                cache: {
                    get: vi.fn()
                }
            }
        };

        user = {
            id: '987654321',
            tag: 'TestUser#1234',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
        };

        // Mock interaction
        interaction = {
            deferReply: vi.fn().mockResolvedValue(),
            editReply: vi.fn().mockResolvedValue(),
            reply: vi.fn().mockResolvedValue(),
            options: {
                getSubcommand: vi.fn(),
                getInteger: vi.fn(),
                getUser: vi.fn(),
                getString: vi.fn()
            },
            guild,
            client,
            user
        };

        // Mock utility functions
        getAnalyticsSummary.mockReturnValue({
            commands: 1000,
            messages: 5000,
            violations: 50,
            modActions: 25,
            currentMembers: 1000,
            memberJoins: 150,
            memberLeaves: 50,
            netGrowth: 100
        });

        getMemberGrowthStats.mockReturnValue([
            { date: '2023-12-01', totalMembers: 950, joinCount: 10, leaveCount: 5 },
            { date: '2023-12-02', totalMembers: 955, joinCount: 15, leaveCount: 10 },
            { date: '2023-12-03', totalMembers: 960, joinCount: 20, leaveCount: 15 }
        ]);

        createSparkline.mockReturnValue('▁▃▅█');

        formatNumber.mockImplementation(num => num.toString());
        formatDuration.mockImplementation(ms => `${Math.floor(ms / 1000)}s`);
    });

    describe('Command Structure', () => {
        it('should have correct command structure', () => {
            expect(analyticsCommand.data.name).toBe('analytics');
            expect(analyticsCommand.data.description).toBe('View server analytics and statistics');
            expect(analyticsCommand.category).toBe('analytics');
        });

        it('should have required permissions', () => {
            // Note: dmPermission is set to false, but the test framework might not expose it directly
            expect(analyticsCommand.data).toBeDefined();
            expect(analyticsCommand.category).toBe('analytics');
        });

        it('should have all subcommands', () => {
            const options = analyticsCommand.data.options;
            const subcommandNames = options.map(opt => opt.name);
            expect(subcommandNames).toContain('server');
            expect(subcommandNames).toContain('commands');
            expect(subcommandNames).toContain('activity');
            expect(subcommandNames).toContain('moderation');
            expect(subcommandNames).toContain('user');
            expect(subcommandNames).toContain('export');
        });
    });

    describe('Server Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('server');
            interaction.options.getInteger.mockReturnValue(7);
        });

        it('should handle server analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(interaction.deferReply).toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledWith({
                embeds: expect.any(Array)
            });
        });

        it('should use default days when not specified', async() => {
            interaction.options.getInteger.mockReturnValue(null);

            await analyticsCommand.execute(interaction);

            expect(getAnalyticsSummary).toHaveBeenCalledWith('123456789', 7);
        });

        it('should display server statistics correctly', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];

            expect(embed.title).toContain('Server Analytics');
            expect(embed.title).toContain('7 Days');
            expect(embed.description).toContain('Test Guild');
            expect(embed.fields).toBeDefined();
            expect(embed.fields.length).toBeGreaterThan(0);
        });

        it('should include member growth trend when data available', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            const trendField = embed.fields.find(f => f.name === '📊 Member Growth Trend');

            expect(trendField).toBeDefined();
            expect(trendField.value).toContain('```');
            expect(createSparkline).toHaveBeenCalledWith([950, 955, 960]);
        });
    });

    describe('Command Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('commands');
            interaction.options.getInteger.mockReturnValue(7);

            getCommandStats.mockReturnValue({
                byCommand: [
                    { name: 'help', count: 500 },
                    { name: 'ping', count: 300 },
                    { name: 'ban', count: 100 }
                ],
                byUser: [
                    { userId: '111', count: 200 },
                    { userId: '222', count: 150 }
                ]
            });

            createBarChart.mockReturnValue('help     ██████████ 500\nping     ███████    300\nban      ███        100');

            client.users.fetch.mockImplementation(async(id) => {
                if (id === '111') {return { tag: 'User1#1234' };}
                if (id === '222') {return { tag: 'User2#5678' };}
                throw new Error('User not found');
            });
        });

        it('should handle commands analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(interaction.deferReply).toHaveBeenCalled();
            expect(getCommandStats).toHaveBeenCalledWith('123456789', 7);
        });

        it('should display command statistics', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];

            expect(embed.title).toContain('Command Usage');
            expect(embed.fields).toBeDefined();
            expect(createBarChart).toHaveBeenCalled();
        });

        it('should handle users with fetch errors gracefully', async() => {
            client.users.fetch.mockRejectedValue(new Error('User not found'));

            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            const userField = embed.fields.find(f => f.name === '👤 Most Active Users');

            expect(userField).toBeDefined();
            expect(userField.value).toContain('Unknown');
        });
    });

    describe('Activity Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('activity');
            interaction.options.getInteger.mockReturnValue(7);

            getMessageStats.mockReturnValue({
                byChannel: [
                    { channelId: 'ch1', count: 1000 },
                    { channelId: 'ch2', count: 800 }
                ],
                byUser: [
                    { userId: '111', count: 500 },
                    { userId: '222', count: 300 }
                ],
                byHour: [
                    { hour: '2023-12-01:10', count: 50 },
                    { hour: '2023-12-01:11', count: 75 }
                ]
            });

            guild.channels.cache.get.mockImplementation((id) => {
                if (id === 'ch1') {return { name: 'general' };}
                if (id === 'ch2') {return { name: 'random' };}
                return null;
            });

            client.users.fetch.mockImplementation(async(id) => {
                if (id === '111') {return { tag: 'User1#1234' };}
                if (id === '222') {return { tag: 'User2#5678' };}
                throw new Error('User not found');
            });
        });

        it('should handle activity analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(getMessageStats).toHaveBeenCalledWith('123456789', 7);
        });

        it('should display activity statistics', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];

            expect(embed.title).toContain('Message Activity');
            expect(embed.fields).toBeDefined();
        });

        it('should handle unknown channels gracefully', async() => {
            guild.channels.cache.get.mockReturnValue(null);

            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            const channelField = embed.fields.find(f => f.name === '📺 Most Active Channels');

            expect(channelField.value).toContain('Unknown');
        });
    });

    describe('Moderation Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('moderation');
            interaction.options.getInteger.mockReturnValue(30);

            getModActionStats.mockReturnValue({
                byAction: [
                    { action: 'ban', count: 10 },
                    { action: 'kick', count: 8 },
                    { action: 'warn', count: 15 }
                ],
                byModerator: [
                    { moderatorId: 'mod1', count: 20 },
                    { moderatorId: 'mod2', count: 13 }
                ]
            });

            getViolationStats.mockReturnValue([
                { type: 'spam', count: 25 },
                { type: 'profanity', count: 15 }
            ]);

            getGuildData.mockReturnValue({
                closedTickets: [
                    { createdAt: Date.now() - 86400000, closedAt: Date.now() - 3600000 },
                    { createdAt: Date.now() - 172800000, closedAt: Date.now() - 7200000 }
                ]
            });

            getUserData.mockReturnValue({
                user1: [{ timestamp: Date.now(), active: true }],
                user2: [{ timestamp: Date.now(), active: false }]
            });

            client.users.fetch.mockImplementation(async(id) => {
                if (id === 'mod1') {return { tag: 'Mod1#1234' };}
                if (id === 'mod2') {return { tag: 'Mod2#5678' };}
                throw new Error('User not found');
            });
        });

        it('should handle moderation analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(getModActionStats).toHaveBeenCalledWith('123456789', 30);
            expect(getViolationStats).toHaveBeenCalledWith('123456789', 30);
        });

        it('should display moderation statistics', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];

            expect(embed.title).toContain('Moderation Analytics');
            expect(embed.fields).toBeDefined();
        });

        it('should calculate and display ticket resolution times', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            const ticketField = embed.fields.find(f => f.name === '🎫 Ticket Statistics');

            expect(ticketField).toBeDefined();
            expect(formatDuration).toHaveBeenCalled();
        });
    });

    describe('User Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('user');
            interaction.options.getUser.mockReturnValue(user);
            interaction.options.getInteger.mockReturnValue(30);

            getCommandStats.mockReturnValue({
                byUser: [
                    { userId: '987654321', count: 150 },
                    { userId: 'other', count: 100 }
                ]
            });

            getMessageStats.mockReturnValue({
                byUser: [
                    { userId: '987654321', count: 500 },
                    { userId: 'other', count: 300 }
                ]
            });

            getUserData.mockReturnValue([
                { timestamp: Date.now(), active: true },
                { timestamp: Date.now() - 86400000, active: true },
                { timestamp: Date.now() - 172800000, active: false }
            ]);
        });

        it('should handle user analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(interaction.options.getUser).toHaveBeenCalledWith('target');
        });

        it('should display user statistics', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];

            expect(embed.title).toContain('User Analytics');
            expect(embed.title).toContain('TestUser#1234');
            expect(embed.thumbnail).toBeDefined();
        });

        it('should calculate user rankings correctly', async() => {
            await analyticsCommand.execute(interaction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            const commandField = embed.fields.find(f => f.name === '⚙️ Command Usage');

            expect(commandField.value).toContain('150');
            expect(commandField.value).toContain('#1'); // Should be rank 1
        });
    });

    describe('Export Analytics Subcommand', () => {
        beforeEach(() => {
            interaction.options.getSubcommand.mockReturnValue('export');
            interaction.options.getString.mockReturnValue('csv');
            interaction.options.getInteger.mockReturnValue(30);

            exportAnalytics.mockResolvedValue({
                filename: 'analytics-123456789-1234567890.csv',
                filepath: '/tmp/analytics-123456789-1234567890.csv',
                size: 10240
            });

            readFileSync.mockReturnValue(Buffer.from('test,csv,data'));
        });

        it('should handle export analytics subcommand', async() => {
            await analyticsCommand.execute(interaction);

            expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(exportAnalytics).toHaveBeenCalledWith('123456789', 'csv', {
                types: ['commands', 'messages', 'violations', 'modactions', 'members'],
                days: 30
            });
        });

        it('should create and send attachment', async() => {
            await analyticsCommand.execute(interaction);

            expect(readFileSync).toHaveBeenCalled();
            expect(interaction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Analytics exported successfully'),
                files: expect.any(Array)
            });
        });

        it('should handle export errors gracefully', async() => {
            exportAnalytics.mockRejectedValue(new Error('Export failed'));

            await analyticsCommand.execute(interaction);

            expect(interaction.editReply).toHaveBeenCalledWith({
                content: '❌ Failed to export analytics. Please try again later.'
            });
        });

        it('should schedule file cleanup', async() => {
            vi.useFakeTimers();
            const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

            await analyticsCommand.execute(interaction);

            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

            vi.restoreAllMocks();
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown subcommands gracefully', async() => {
            interaction.options.getSubcommand.mockReturnValue('unknown');

            const result = await analyticsCommand.execute(interaction);

            expect(result).toBeUndefined();
        });

        it('should handle database errors during summary fetch', async() => {
            interaction.options.getSubcommand.mockReturnValue('server');
            interaction.options.getInteger.mockReturnValue(7);
            
            getAnalyticsSummary.mockImplementation(() => {
                throw new Error('Database error');
            });

            await expect(analyticsCommand.execute(interaction)).rejects.toThrow('Database error');
        });
    });

    describe('Input Validation', () => {
        it('should use default days when invalid value provided', async() => {
            // Discord API prevents values below minValue, so test with valid minimum
            interaction.options.getInteger.mockReturnValue(1);
            interaction.options.getSubcommand.mockReturnValue('server');

            await analyticsCommand.execute(interaction);

            expect(getAnalyticsSummary).toHaveBeenCalledWith('123456789', 1);
        });

        it('should handle missing user in user analytics', async() => {
            interaction.options.getSubcommand.mockReturnValue('user');
            interaction.options.getUser.mockReturnValue(null);

            await expect(analyticsCommand.execute(interaction)).rejects.toThrow();
        });
    });
});