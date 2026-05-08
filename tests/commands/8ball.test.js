// 8ball Command Tests
// Tests for the 8ball command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import eightBallCommand from '../../src/commands/8ball.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';

describe('8ball Command', () => {
    let mockInteraction;

    beforeEach(() => {
        mockInteraction = createMockInteraction({
            user: createMockUser({ tag: 'TestUser#0001' }),
            options: {
                getString: vi.fn().mockReturnValue('Will I win the lottery?')
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(eightBallCommand.name).toBe('8ball');
        });

        it('should have a description', () => {
            expect(eightBallCommand.description).toBeTruthy();
            expect(typeof eightBallCommand.description).toBe('string');
        });

        it('should be in Fun category', () => {
            expect(eightBallCommand.category).toBe('Fun');
        });

        it('should allow DM usage', () => {
            expect(eightBallCommand.dmPermission).toBe(true);
        });

        it('should have required question option', () => {
            expect(eightBallCommand.options).toHaveLength(1);
            const option = eightBallCommand.options[0];
            expect(option.name).toBe('question');
            expect(option.required).toBe(true);
            expect(option.type).toBe(3); // STRING
        });
    });

    describe('execute', () => {
        it('should reply with an embed', async() => {
            await eightBallCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall).toHaveProperty('embeds');
            expect(replyCall.embeds).toHaveLength(1);
        });

        it('should include question in embed description', async() => {
            const question = 'Is this a test?';
            mockInteraction.options.getString.mockReturnValue(question);

            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.description).toContain(question);
        });

        it('should include answer in embed description', async() => {
            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.description).toContain('**Answer:**');
        });

        it('should have correct title', async() => {
            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.title).toBe('🎱 Magic 8-Ball');
        });

        it('should include requester in fields', async() => {
            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.fields).toBeDefined();
            expect(embed.fields).toHaveLength(1);
            expect(embed.fields[0].name).toBe('[INFO] Asked by');
            expect(embed.fields[0].value).toBe('TestUser#0001');
        });

        it('should include timestamp', async() => {
            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.timestamp).toBeTruthy();
        });

        it('should have a color based on response type', async() => {
            await eightBallCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.color).toBeDefined();
            // Color should be one of: green (0x00FF00), orange (0xFFA500), or red (0xFF0000)
            expect([0x00FF00, 0xFFA500, 0xFF0000]).toContain(embed.color);
        });
    });

    describe('Error Handling', () => {
        it('should handle errors gracefully', async() => {
            // Simulate an error by making getString throw
            mockInteraction.options.getString.mockImplementation(() => {
                throw new Error('Mock error');
            });

            await eightBallCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.ephemeral).toBe(true);
            expect(replyCall).toHaveProperty('embeds');
            expect(replyCall.embeds).toHaveLength(1);

            const embed = replyCall.embeds[0];
            expect(embed.title).toBe('[ERROR] Command Failed');
            expect(embed.color).toBe(0xFF0000);
        });
    });
});