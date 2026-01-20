// Ping Command Tests
// Tests for the ping command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pingCommand from '../../src/commands/ping.js';
import { createMockInteraction, createMockClient, createMockUser } from '../mocks/discord.js';

describe('Ping Command', () => {
    let mockInteraction;

    beforeEach(() => {
        mockInteraction = createMockInteraction({
            user: createMockUser({ tag: 'TestUser#0001' }),
            client: createMockClient({ wsPing: 50 }),
            createdTimestamp: Date.now() - 100 // 100ms ago
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(pingCommand.name).toBe('ping');
        });

        it('should have a description', () => {
            expect(pingCommand.description).toBeTruthy();
            expect(typeof pingCommand.description).toBe('string');
        });

        it('should be in Utility category', () => {
            expect(pingCommand.category).toBe('Utility');
        });
    });

    describe('execute', () => {
        it('should defer reply first', async () => {
            await pingCommand.execute(mockInteraction);
            
            expect(mockInteraction.deferReply).toHaveBeenCalled();
        });

        it('should edit reply with embed', async () => {
            await pingCommand.execute(mockInteraction);
            
            expect(mockInteraction.editReply).toHaveBeenCalled();
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            expect(replyCall).toHaveProperty('embeds');
            expect(replyCall.embeds).toHaveLength(1);
        });

        it('should include latency information in embed', async () => {
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            const embedData = embed.toJSON();
            
            expect(embedData.title).toBe('Pong!');
            expect(embedData.fields).toBeDefined();
            
            const latencyField = embedData.fields.find(f => f.name === 'Round-Trip Latency');
            expect(latencyField).toBeTruthy();
            expect(latencyField.value).toContain('ms');
        });

        it('should include API latency', async () => {
            mockInteraction.client.ws.ping = 75;
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            const apiField = embedData.fields.find(f => f.name === 'API Latency');
            expect(apiField).toBeTruthy();
            expect(apiField.value).toBe('75ms');
        });

        it('should show EXCELLENT status for low latency', async () => {
            mockInteraction.createdTimestamp = Date.now() - 50; // 50ms
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            const statusField = embedData.fields.find(f => f.name === 'Status');
            expect(statusField.value).toBe('[EXCELLENT]');
        });

        it('should show GOOD status for moderate latency', async () => {
            mockInteraction.createdTimestamp = Date.now() - 150; // 150ms
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            const statusField = embedData.fields.find(f => f.name === 'Status');
            expect(statusField.value).toBe('[GOOD]');
        });

        it('should show MODERATE status for higher latency', async () => {
            mockInteraction.createdTimestamp = Date.now() - 300; // 300ms
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            const statusField = embedData.fields.find(f => f.name === 'Status');
            expect(statusField.value).toBe('[MODERATE]');
        });

        it('should show POOR status for high latency', async () => {
            mockInteraction.createdTimestamp = Date.now() - 500; // 500ms
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            const statusField = embedData.fields.find(f => f.name === 'Status');
            expect(statusField.value).toBe('[POOR]');
        });

        it('should include requester in footer', async () => {
            mockInteraction.user.tag = 'RequesterUser#9999';
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            expect(embedData.footer.text).toContain('RequesterUser#9999');
        });

        it('should include timestamp', async () => {
            await pingCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.editReply.mock.calls[0][0];
            const embedData = replyCall.embeds[0].toJSON();
            
            expect(embedData.timestamp).toBeTruthy();
        });
    });
});
