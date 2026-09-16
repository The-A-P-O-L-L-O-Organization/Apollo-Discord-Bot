// Joke Command Tests
// Tests for the joke command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import jokeCommand from '../../src/plugins/utility/commands/joke.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';
import type { MockCommandInteraction } from '../mocks/discord.js';

describe('Joke Command', () => {
    let mockInteraction: MockCommandInteraction;

    beforeEach(() => {
        mockInteraction = createMockInteraction({
            user: createMockUser({ tag: 'TestUser#0001' })
        }) as unknown as MockCommandInteraction;
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(jokeCommand.name).toBe('joke');
        });

        it('should have a description', () => {
            expect(jokeCommand.description).toBeTruthy();
            expect(typeof jokeCommand.description).toBe('string');
        });

        it('should be in Fun category', () => {
            expect(jokeCommand.category).toBe('Fun');
        });

        it('should allow DM usage', () => {
            expect(jokeCommand.dmPermission).toBe(true);
        });

        it('should have no options', () => {
            expect((jokeCommand as unknown as { options: unknown }).options).toBeUndefined();
        });
    });

    describe('execute', () => {
        it('should reply with an embed', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall).toHaveProperty('embeds');
            expect(replyCall.embeds).toHaveLength(1);
        });

        it('should include joke setup and punchline in embed description', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];

            expect(embed.description).toContain('**');
            expect(embed.description).toContain('\n\n');
        });

        it('should have correct title', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];

            expect(embed.title).toBe('😂 Random Joke');
        });

        it('should include requester in fields', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];

            expect(embed.fields).toBeDefined();
            expect(embed.fields).toHaveLength(1);
            expect(embed.fields[0].name).toBe('[INFO] Requested by');
            expect(embed.fields[0].value).toBe('TestUser#0001');
        });

        it('should include timestamp', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];

            expect(embed.timestamp).toBeTruthy();
        });

        it('should have blue color', async() => {
            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            const embed = replyCall.embeds[0];

            expect(embed.color).toBe(0x3498DB);
        });
    });

    describe('Error Handling', () => {
        it('should handle errors gracefully', async() => {
            // Mock Math.random to throw an error
            const originalRandom = Math.random;
            Math.random = vi.fn(() => {
                throw new Error('Mock error');
            });

            await jokeCommand.execute(mockInteraction as unknown as ChatInputCommandInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0]![0];
            expect(replyCall.flags).toBe(64);
            expect(replyCall).toHaveProperty('embeds');
            expect(replyCall.embeds).toHaveLength(1);

            const embed = replyCall.embeds[0];
            expect(embed.title).toBe('[ERROR] Command Failed');
            expect(embed.color).toBe(0xFF0000);

            // Restore Math.random
            Math.random = originalRandom;
        });
    });
});