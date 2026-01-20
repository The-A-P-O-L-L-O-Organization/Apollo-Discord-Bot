// Help Command Tests
// Tests for the help command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import helpCommand from '../../src/commands/help.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockClient
} from '../mocks/discord.js';

describe('Help Command', () => {
    let mockInteraction;
    let mockClient;
    let mockCommands;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock commands collection
        mockCommands = new Map();
        mockCommands.set('ping', {
            name: 'ping',
            description: 'Check bot latency',
            category: 'Utility',
            options: []
        });
        mockCommands.set('ban', {
            name: 'ban',
            description: 'Ban a user',
            category: 'Moderation',
            options: [
                { name: 'user', required: true },
                { name: 'reason', required: false }
            ],
            defaultMemberPermissions: BigInt(4)
        });
        mockCommands.set('help', {
            name: 'help',
            description: 'Show help',
            category: 'Utility',
            options: []
        });
        
        mockClient = createMockClient();
        mockClient.commands = mockCommands;
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            client: mockClient
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(helpCommand.name).toBe('help');
        });

        it('should have a description', () => {
            expect(helpCommand.description).toBeTruthy();
        });

        it('should be in Utility category', () => {
            expect(helpCommand.category).toBe('Utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should display help embed', async () => {
            await helpCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Bot Help Menu');
        });

        it('should group commands by category', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            // Check that categories exist
            const fieldNames = embed.fields.map(f => f.name);
            expect(fieldNames.some(n => n.includes('Utility'))).toBe(true);
            expect(fieldNames.some(n => n.includes('Moderation'))).toBe(true);
        });

        it('should show total command count in footer', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.footer.text).toContain('3'); // Total commands
        });

        it('should show command usage format', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            // Find moderation category field
            const moderationField = embed.fields.find(f => f.name.includes('Moderation'));
            expect(moderationField.value).toContain('/ban');
            expect(moderationField.value).toContain('<user>');
        });

        it('should show required vs optional parameters', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const moderationField = embed.fields.find(f => f.name.includes('Moderation'));
            expect(moderationField.value).toContain('<user>'); // Required
            expect(moderationField.value).toContain('[reason]'); // Optional
        });

        it('should include legend for parameters', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const legendField = embed.fields.find(f => f.name === 'Legend');
            expect(legendField).toBeDefined();
            expect(legendField.value).toContain('<param>');
            expect(legendField.value).toContain('[param]');
        });

        it('should include usage guide', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const usageField = embed.fields.find(f => f.name === 'How to Use Commands');
            expect(usageField).toBeDefined();
        });

        it('should not be ephemeral', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.ephemeral).toBeFalsy();
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle empty commands collection', async () => {
            mockClient.commands = new Map();
            
            await helpCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].footer.text).toContain('0');
        });

        it('should handle commands without category', async () => {
            mockCommands.set('nocategory', {
                name: 'nocategory',
                description: 'No category command',
                options: []
            });
            
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const uncategorizedField = embed.fields.find(f => f.name.includes('Uncategorized'));
            expect(uncategorizedField).toBeDefined();
        });

        it('should handle commands without options', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const utilityField = embed.fields.find(f => f.name.includes('Utility'));
            expect(utilityField.value).toContain('/ping');
        });

        it('should show permission requirements for commands', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const moderationField = embed.fields.find(f => f.name.includes('Moderation'));
            expect(moderationField.value).toContain('Requires');
        });
    });

    describe('execute - Sorting', () => {
        it('should sort Utility category first', async () => {
            await helpCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            // Find category fields (excluding usage guide and legend)
            const categoryFields = embed.fields.filter(f => f.name.includes('[CATEGORY]'));
            expect(categoryFields[0].name).toContain('Utility');
        });
    });
});
