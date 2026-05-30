import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionsBitField } from 'discord.js';

// Mock the modLog utility
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn()
}));

import { sendModLog } from '../../src/utils/modLog.js';
import clearCommand from '../../src/plugins/moderation/commands/clear.js';

describe('Clear Command', () => {
    let interaction;
    let channel;
    let guild;
    let user;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock channel
        channel = {
            id: '123456789',
            name: 'general',
            isTextBased: vi.fn().mockReturnValue(true),
            messages: {
                fetch: vi.fn()
            },
            bulkDelete: vi.fn()
        };

        // Mock guild
        guild = {
            id: 'guild123'
        };

        // Mock user
        user = {
            id: 'user123',
            tag: 'TestUser#1234'
        };

        // Mock interaction
        interaction = {
            channel,
            guild,
            user,
            options: {
                getInteger: vi.fn(),
                getBoolean: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(),
            deferReply: vi.fn().mockResolvedValue(),
            deferUpdate: vi.fn().mockResolvedValue(),
            editReply: vi.fn().mockResolvedValue(),
            followUp: vi.fn().mockResolvedValue()
        };
    });

    describe('Command Structure', () => {
        it('should have correct command structure', () => {
            expect(clearCommand.name).toBe('clear');
            expect(clearCommand.description).toBe('Bulk delete messages in the current channel');
            expect(clearCommand.category).toBe('Moderation');
        });

        it('should have correct permissions', () => {
            expect(clearCommand.defaultMemberPermissions).toBe(PermissionsBitField.Flags.ManageMessages);
            expect(clearCommand.dmPermission).toBe(false);
        });

        it('should have correct options', () => {
            expect(clearCommand.options).toHaveLength(2);
            expect(clearCommand.options[0].name).toBe('amount');
            expect(clearCommand.options[1].name).toBe('all');
        });
    });

    describe('Normal Message Deletion', () => {
        beforeEach(() => {
            interaction.options.getBoolean.mockReturnValue(false);
            channel.messages.fetch.mockResolvedValue({
                size: 5,
                values: vi.fn()
            });
            channel.bulkDelete.mockResolvedValue({
                size: 5
            });
        });

        it('should use default amount of 5 when no amount specified', async() => {
            interaction.options.getInteger.mockReturnValue(null);

            await clearCommand.execute(interaction);

            expect(channel.messages.fetch).toHaveBeenCalledWith({ limit: 5 });
        });

        it('should use specified amount', async() => {
            interaction.options.getInteger.mockReturnValue(10);

            await clearCommand.execute(interaction);

            expect(channel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
        });

        it('should handle successful message deletion', async() => {
            interaction.options.getInteger.mockReturnValue(3);
            const mockFetched = { size: 5, values: vi.fn() };
            channel.messages.fetch.mockResolvedValue(mockFetched);

            await clearCommand.execute(interaction);

            expect(channel.bulkDelete).toHaveBeenCalledWith(mockFetched, true);
            expect(sendModLog).toHaveBeenCalledWith(guild, {
                action: 'clear',
                target: { tag: '#general', id: '123456789' },
                moderator: user,
                extra: {
                    'Channel': '<#123456789>',
                    'Messages Deleted': '5'
                }
            });
        });

        it('should send success embed', async() => {
            interaction.options.getInteger.mockReturnValue(7);

            await clearCommand.execute(interaction);

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[SUCCESS] Messages Cleared');
            expect(embed.description).toContain('5 message(s)');
            expect(embed.color).toBe(0x00FF00);
        });
    });

    describe('No Messages to Delete', () => {
        beforeEach(() => {
            interaction.options.getBoolean.mockReturnValue(false);
            interaction.options.getInteger.mockReturnValue(10);
            channel.messages.fetch.mockResolvedValue({
                size: 0
            });
        });

        it('should handle case when no messages are found', async() => {
            await clearCommand.execute(interaction);

            expect(channel.bulkDelete).not.toHaveBeenCalled();
            expect(sendModLog).not.toHaveBeenCalled();

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[WARNING] No Messages');
            expect(embed.color).toBe(0xFFAA00);
        });
    });

    describe('Delete All Functionality', () => {
        let mockResponse;
        let mockCollector;

        beforeEach(() => {
            interaction.options.getBoolean.mockReturnValue(true);
            interaction.options.getInteger.mockReturnValue(null);

            // Mock the confirmation response and collector
            mockCollector = {
                on: vi.fn(),
                stop: vi.fn()
            };

            mockResponse = {
                createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector)
            };

            interaction.reply.mockResolvedValue(mockResponse);

            // Mock multiple fetch calls for delete all
            channel.messages.fetch
                .mockResolvedValueOnce({
                    size: 100,
                    values: vi.fn()
                })
                .mockResolvedValueOnce({
                    size: 50,
                    values: vi.fn()
                })
                .mockResolvedValueOnce({
                    size: 0,
                    values: vi.fn()
                });

            channel.bulkDelete
                .mockResolvedValueOnce({ size: 100 })
                .mockResolvedValueOnce({ size: 50 });
        });

        it('should show confirmation dialog for delete all', async() => {
            // Simulate timeout without button interaction
            mockCollector.on.mockImplementation((event, callback) => {
                if (event === 'end') {
                    setTimeout(() => callback(new Map(), 'time'), 10);
                }
            });

            await clearCommand.execute(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                embeds: expect.any(Array),
                components: expect.any(Array),
                fetchReply: true
            });
        });

        it('should handle confirm delete all', async() => {
            let collectCallback;
            mockCollector.on.mockImplementation((event, callback) => {
                if (event === 'collect') {collectCallback = callback;}
            });

            const executePromise = clearCommand.execute(interaction);
            await executePromise;

            const buttonInteraction = {
                customId: 'confirm_delete_all',
                deferUpdate: vi.fn().mockResolvedValue()
            };
            await collectCallback(buttonInteraction);

            expect(channel.bulkDelete).toHaveBeenCalled();
            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[SUCCESS] All Messages Deleted');
            expect(interaction.editReply.mock.calls[0][0].components).toEqual([]);
        });

        it('should handle cancel delete all', async() => {
            let collectCallback;
            mockCollector.on.mockImplementation((event, callback) => {
                if (event === 'collect') {collectCallback = callback;}
            });

            const executePromise = clearCommand.execute(interaction);
            await executePromise;

            const buttonInteraction = {
                customId: 'cancel_delete_all',
                update: vi.fn().mockResolvedValue()
            };
            await collectCallback(buttonInteraction);

            const embed = buttonInteraction.update.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[CANCELLED] Operation Aborted');
            expect(buttonInteraction.update.mock.calls[0][0].components).toEqual([]);
        });

        it('should handle timeout in delete all confirmation', async() => {
            let endCallback;
            mockCollector.on.mockImplementation((event, callback) => {
                if (event === 'end') {endCallback = callback;}
            });

            const executePromise = clearCommand.execute(interaction);
            await executePromise;

            await endCallback(new Map(), 'time');

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[TIMEOUT] Confirmation Expired');
            expect(interaction.editReply.mock.calls[0][0].components).toEqual([]);
        });

        it('should handle errors during delete all', async() => {
            let collectCallback;
            mockCollector.on.mockImplementation((event, callback) => {
                if (event === 'collect') {collectCallback = callback;}
            });

            channel.bulkDelete.mockReset().mockRejectedValue(new Error('Delete failed'));
            channel.messages.fetch.mockReset().mockResolvedValue({ size: 5, values: vi.fn() });

            const executePromise = clearCommand.execute(interaction);
            await executePromise;

            const buttonInteraction = {
                customId: 'confirm_delete_all',
                deferUpdate: vi.fn().mockResolvedValue()
            };
            await collectCallback(buttonInteraction);

            const embed = interaction.editReply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[ERROR] Delete Failed');
            expect(interaction.editReply.mock.calls[0][0].components).toEqual([]);
        });
    });

    describe('Error Handling', () => {
        it('should handle non-text channels', async() => {
            channel.isTextBased.mockReturnValue(false);

            await clearCommand.execute(interaction);

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[ERROR] Invalid Channel');
            expect(embed.description).toContain('text channels');
        });

        it('should handle fetch errors', async() => {
            interaction.options.getBoolean.mockReturnValue(false);
            interaction.options.getInteger.mockReturnValue(5);
            channel.messages.fetch.mockRejectedValue(new Error('Fetch failed'));

            await clearCommand.execute(interaction);

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[ERROR] Command Failed');
        });

        it('should handle bulk delete errors', async() => {
            interaction.options.getBoolean.mockReturnValue(false);
            interaction.options.getInteger.mockReturnValue(5);
            channel.messages.fetch.mockResolvedValue({ size: 3, values: vi.fn() });
            channel.bulkDelete.mockRejectedValue(new Error('Bulk delete failed'));

            await clearCommand.execute(interaction);

            const embed = interaction.reply.mock.calls[0][0].embeds[0];
            expect(embed.title).toBe('[ERROR] Command Failed');
        });
    });

    describe('Input Validation', () => {
        it('should respect amount limits from Discord API', () => {
            // Discord API should handle min_value: 1 and max_value: 100
            // These are enforced at the API level, so we don't need to test them here
            expect(clearCommand.options[0].min_value).toBe(1);
            expect(clearCommand.options[0].max_value).toBe(100);
        });

        it('should handle boolean all option', () => {
            expect(clearCommand.options[1].type).toBe(5); // BOOLEAN type
            expect(clearCommand.options[1].name).toBe('all');
        });
    });
});