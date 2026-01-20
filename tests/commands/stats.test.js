// Stats Command Tests
// Tests for the stats command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import statsCommand from '../../src/commands/stats.js';
import { 
    createMockInteraction, 
    createMockUser,
    createMockClient,
    createMockGuild
} from '../mocks/discord.js';

describe('Stats Command', () => {
    let mockInteraction;
    let mockClient;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create mock guilds
        const mockGuilds = new Map();
        mockGuilds.set('1', createMockGuild({ id: '1', memberCount: 100 }));
        mockGuilds.set('2', createMockGuild({ id: '2', memberCount: 50 }));
        
        // Create mock channels
        const channels1 = new Map();
        channels1.set('c1', { id: 'c1' });
        channels1.set('c2', { id: 'c2' });
        
        const channels2 = new Map();
        channels2.set('c3', { id: 'c3' });
        
        mockGuilds.get('1').channels = { cache: channels1 };
        mockGuilds.get('2').channels = { cache: channels2 };
        
        mockClient = createMockClient({
            wsPing: 50
        });
        mockClient.uptime = 3661000; // 1 hour, 1 minute, 1 second
        mockClient.guilds = { cache: mockGuilds };
        mockClient.commands = new Map([
            ['ping', {}],
            ['help', {}],
            ['stats', {}]
        ]);
        mockClient.stats = {
            commandsRan: 1500,
            messagesProcessed: 50000
        };
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '123456789', tag: 'TestUser#0001' }),
            client: mockClient,
            createdTimestamp: Date.now()
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(statsCommand.data.name).toBe('stats');
        });

        it('should have a description', () => {
            expect(statsCommand.data.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(statsCommand.category).toBe('utility');
        });
    });

    describe('execute - Success Cases', () => {
        it('should display stats embed', async () => {
            await statsCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('Bot Statistics');
        });

        it('should show server count', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('2'); // 2 servers
        });

        it('should show total user count', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('150'); // 100 + 50 users
        });

        it('should show total channel count', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('3'); // 3 channels
        });

        it('should show command count', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('3'); // 3 commands
        });

        it('should show uptime', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('1h');
            expect(systemField.value).toContain('1m');
        });

        it('should show memory usage', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('MB');
        });

        it('should show Node.js version', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('Node.js');
        });

        it('should show Discord.js version', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('Discord.js');
        });

        it('should show session stats', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const sessionField = embed.fields.find(f => f.name === 'Session Stats');
            expect(sessionField.value).toContain('1,500'); // Commands ran
            expect(sessionField.value).toContain('50,000'); // Messages processed
        });

        it('should show latency', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const latencyField = embed.fields.find(f => f.name === 'Latency');
            expect(latencyField.value).toContain('ms');
            expect(latencyField.value).toContain('API Latency');
        });

        it('should show bot ID in footer', async () => {
            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.footer.text).toContain('Bot ID');
        });
    });

    describe('execute - Edge Cases', () => {
        it('should handle missing stats object', async () => {
            mockClient.stats = undefined;

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const sessionField = embed.fields.find(f => f.name === 'Session Stats');
            expect(sessionField.value).toContain('0');
        });

        it('should handle missing commands collection', async () => {
            mockClient.commands = undefined;

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('0'); // 0 commands
        });

        it('should handle empty guilds', async () => {
            mockClient.guilds.cache = new Map();

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const generalField = embed.fields.find(f => f.name === 'General');
            expect(generalField.value).toContain('0'); // 0 servers
        });

        it('should format large numbers with commas', async () => {
            mockClient.stats = {
                commandsRan: 1234567,
                messagesProcessed: 9876543
            };

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const sessionField = embed.fields.find(f => f.name === 'Session Stats');
            expect(sessionField.value).toContain(',');
        });
    });

    describe('execute - Uptime Formatting', () => {
        it('should format days correctly', async () => {
            mockClient.uptime = 2 * 24 * 60 * 60 * 1000 + 3600000; // 2 days, 1 hour

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('2d');
            expect(systemField.value).toContain('1h');
        });

        it('should format seconds only', async () => {
            mockClient.uptime = 45000; // 45 seconds

            await statsCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            const systemField = embed.fields.find(f => f.name === 'System');
            expect(systemField.value).toContain('45s');
        });
    });
});
