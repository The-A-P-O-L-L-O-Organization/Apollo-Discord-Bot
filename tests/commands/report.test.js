/* eslint-disable no-console */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database utilities
vi.mock('../../src/utils/db.js', () => ({
    setGuildData: vi.fn(),
    updateGuildData: vi.fn(),
    generateId: vi.fn()
}));

// Mock the modLog utility
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn()
}));

// Mock the logger utility
vi.mock('../../src/utils/logger.js', () => ({
    getLoggingConfig: vi.fn()
}));

import { updateGuildData, generateId } from '../../src/utils/db.js';
import { getLoggingConfig } from '../../src/utils/logger.js';
import reportCommand from '../../src/plugins/utility/commands/report.js';
import { handleReportSubmission } from '../../src/utils/reportHandler.js';

describe('Report Command', () => {
    let interaction;
    let message;
    let channel;
    let guild;
    let user;
    let author;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock author
        author = {
            id: 'author123',
            tag: 'ReportedUser#1234',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
        };

        // Mock reported message
        message = {
            id: 'message123',
            content: 'This is a reported message',
            author,
            reference: { messageId: 'message123' }
        };

        // Mock channel
        channel = {
            id: 'channel123',
            name: 'general',
            messages: {
                fetch: vi.fn().mockResolvedValue(message)
            }
        };

        // Mock guild
        guild = {
            id: 'guild123',
            channels: {
                cache: {
                    get: vi.fn()
                }
            }
        };

        // Mock user (reporter)
        user = {
            id: 'reporter123',
            tag: 'ReporterUser#5678'
        };

        // Mock interaction
        interaction = {
            user,
            guild,
            channel,
            options: {
                getMessage: vi.fn()
            },
            showModal: vi.fn().mockResolvedValue(),
            reply: vi.fn().mockResolvedValue(),
            message
        };
    });

    describe('Command Structure', () => {
        it('should have correct command structure', () => {
            expect(reportCommand.data.name).toBe('ReportMessage');
            expect(reportCommand.data.type).toBe(3); // ApplicationCommandType.Message
            expect(reportCommand.name).toBe('reportmessage');
            expect(reportCommand.description).toBe('Report a message to the moderators');
            expect(reportCommand.category).toBe('Utility');
        });
    });

    describe('Message Context Menu Execution', () => {
        it('should show modal when message is found', async() => {
            interaction.options.getMessage.mockReturnValue(message);

            await reportCommand.execute(interaction);

            expect(interaction.showModal).toHaveBeenCalledWith({
                title: 'Report Message',
                custom_id: 'report_reason_modal',
                components: expect.any(Array)
            });
        });

        it('should handle missing message', async() => {
            interaction.options.getMessage.mockReturnValue(null);

            await reportCommand.execute(interaction);

            expect(interaction.showModal).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '[ERROR] Could not find the message to report.',
                flags: 64
            });
        });

        it('should prevent reporting own message', async() => {
            message.author.id = user.id; // Same as reporter
            interaction.options.getMessage.mockReturnValue(message);

            await reportCommand.execute(interaction);

            expect(interaction.showModal).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '[ERROR] You cannot report your own message.',
                flags: 64
            });
        });

        it('should handle errors gracefully', async() => {
            interaction.options.getMessage.mockImplementation(() => {
                throw new Error('Test error');
            });

            await reportCommand.execute(interaction);

            expect(interaction.reply).toHaveBeenCalledWith({
                embeds: [expect.objectContaining({
                    title: '[ERROR] Report Failed',
                    color: 0xFF0000
                })],
                flags: 64
            });
        });
    });
});

describe('Report Handler', () => {
    let interaction;
    let client;
    let message;
    let channel;
    let guild;
    let user;
    let author;
    let logChannel;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock generateId
        generateId.mockReturnValue('report123');

        // Mock author
        author = {
            id: 'author123',
            tag: 'ReportedUser#1234',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
        };

        // Mock reported message
        message = {
            id: 'message123',
            content: 'This is a reported message',
            author
        };

        // Mock log channel
        logChannel = {
            id: 'logchannel123',
            send: vi.fn().mockResolvedValue()
        };

        // Mock channel
        channel = {
            id: 'channel123',
            name: 'general',
            messages: {
                fetch: vi.fn().mockResolvedValue(message)
            }
        };

        // Mock guild
        guild = {
            id: 'guild123',
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue(logChannel)
                }
            }
        };

        // Mock user (reporter)
        user = {
            id: 'reporter123',
            tag: 'ReporterUser#5678'
        };

        // Mock client
        client = {};

        // Mock interaction
        interaction = {
            isModalSubmit: vi.fn().mockReturnValue(true),
            customId: 'report_reason_modal',
            user,
            guild,
            channel,
            message: {
                reference: { messageId: 'message123' }
            },
            fields: {
                getTextInputValue: vi.fn().mockReturnValue('This message is inappropriate')
            },
            reply: vi.fn().mockResolvedValue()
        };

        // Mock logging config
        getLoggingConfig.mockResolvedValue({
            channelId: 'logchannel123'
        });
    });

    describe('Modal Submission Handling', () => {
        it('should return false for non-modal interactions', async() => {
            interaction.isModalSubmit.mockReturnValue(false);

            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(false);
        });

        it('should return false for wrong modal ID', async() => {
            interaction.customId = 'wrong_modal';

            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(false);
            expect(updateGuildData).not.toHaveBeenCalled();
        });

        it('should handle missing message reference', async() => {
            interaction.message.reference = null;

            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(true);
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '[ERROR] Could not find the original message. The report has been cancelled.',
                flags: 64
            });
        });

        it('should handle deleted messages', async() => {
            channel.messages.fetch.mockRejectedValue(new Error('Message not found'));

            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(true);
            expect(interaction.reply).toHaveBeenCalledWith({
                content: '[ERROR] Could not fetch the message. It may have been deleted.',
                flags: 64
            });
        });

        it('should successfully create and save report', async() => {
            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(true);
            expect(generateId).toHaveBeenCalled();
            expect(updateGuildData).toHaveBeenCalledWith('reports', 'guild123', expect.any(Function));
        });

        it('should send success embed to reporter', async() => {
            await handleReportSubmission(interaction, client);

            expect(interaction.reply).toHaveBeenCalledWith({
                embeds: [expect.objectContaining({
                    title: '[SUCCESS] Report Submitted',
                    color: 0x00FF00,
                    fields: expect.arrayContaining([
                        expect.objectContaining({ name: '[INFO] Report ID', value: '#report123' }),
                        expect.objectContaining({ name: '[INFO] Reported User', value: 'ReportedUser#1234' }),
                        expect.objectContaining({ name: '[INFO] Channel', value: '<#channel123>' })
                    ])
                })],
                flags: 64
            });
        });

        it('should send detailed report to mod log channel', async() => {
            await handleReportSubmission(interaction, client);

            expect(logChannel.send).toHaveBeenCalledWith({
                embeds: [expect.objectContaining({
                    title: '[MODERATION] New Message Report',
                    color: 0xFFA500,
                    fields: expect.arrayContaining([
                        expect.objectContaining({ name: '[INFO] Report ID', value: '#report123' }),
                        expect.objectContaining({ name: '[INFO] Reporter', value: 'ReporterUser#5678\n`reporter123`' }),
                        expect.objectContaining({ name: '[INFO] Reported User', value: 'ReportedUser#1234\n`author123`' }),
                        expect.objectContaining({ name: '[INFO] Channel', value: '<#channel123>' }),
                        expect.objectContaining({ name: '[INFO] Reason', value: 'This message is inappropriate' }),
                        expect.objectContaining({ name: '[INFO] Reported Message', value: 'This is a reported message' }),
                        expect.objectContaining({ name: '[LINK] Message Link', value: 'https://discord.com/channels/guild123/channel123/message123' })
                    ]),
                    thumbnail: { url: 'https://example.com/avatar.png' },
                    footer: { text: 'Use /reports view report123 to manage this report' }
                })],
                components: expect.any(Array)
            });
        });

        it('should include action buttons in mod log', async() => {
            await handleReportSubmission(interaction, client);

            const callArgs = logChannel.send.mock.calls[0][0];
            const actionRow = callArgs.components[0];

            expect(actionRow.components).toHaveLength(3);
            expect(actionRow.components[0]).toEqual({
                type: 2,
                style: 3,
                label: 'Review',
                custom_id: 'report_review_report123'
            });
            expect(actionRow.components[1]).toEqual({
                type: 2,
                style: 4,
                label: 'Dismiss',
                custom_id: 'report_dismiss_report123'
            });
            expect(actionRow.components[2]).toEqual({
                type: 2,
                style: 1,
                label: 'View Message',
                url: 'https://discord.com/channels/guild123/channel123/message123'
            });
        });

        it('should handle messages without text content', async() => {
            message.content = null;

            await handleReportSubmission(interaction, client);

            const callArgs = logChannel.send.mock.calls[0][0];
            const embed = callArgs.embeds[0];
            const messageField = embed.fields.find(f => f.name === '[INFO] Reported Message');

            expect(messageField.value).toBe('[No text content]');
        });

        it('should handle missing logging channel', async() => {
            getLoggingConfig.mockResolvedValue(null);

            await handleReportSubmission(interaction, client);

            expect(logChannel.send).not.toHaveBeenCalled();
        });

        it('should handle missing log channel in cache', async() => {
            guild.channels.cache.get.mockReturnValue(null);

            await handleReportSubmission(interaction, client);

            expect(logChannel.send).not.toHaveBeenCalled();
        });

        it('should handle users without avatar', async() => {
            author.displayAvatarURL.mockReturnValue(null);

            await handleReportSubmission(interaction, client);

            const callArgs = logChannel.send.mock.calls[0][0];
            const embed = callArgs.embeds[0];

            expect(embed.thumbnail).toBeUndefined();
        });

        it('should handle errors gracefully', async() => {
            updateGuildData.mockImplementation(() => {
                throw new Error('Database error');
            });

            const result = await handleReportSubmission(interaction, client);

            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalledWith('[ERROR] Report submission error:', expect.any(Error));
        });
    });
});