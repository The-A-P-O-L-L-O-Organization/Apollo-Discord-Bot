// Ready Event Tests
// Tests for the ready event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import readyHandler from '../../src/events/ready.js';
import { createMockClient, createMockUser, createMockGuild } from '../mocks/discord.js';
import { ActivityType } from 'discord.js';

describe('Ready Event', () => {
    let mockClient;
    let consoleSpy;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Spy on console.log
        consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        // Create guilds cache with some test guilds
        const guildsCache = new Map();
        guildsCache.set('guild1', createMockGuild({ id: 'guild1', name: 'Test Server 1' }));
        guildsCache.set('guild2', createMockGuild({ id: 'guild2', name: 'Test Server 2' }));
        
        mockClient = createMockClient({
            user: {
                ...createMockUser({ id: 'BOT_ID', tag: 'ApolloBot#1234', bot: true }),
                setActivity: vi.fn()
            },
            guilds: {
                cache: guildsCache,
                fetch: vi.fn()
            }
        });
    });

    describe('Success Cases', () => {
        it('should log successful connection message', async () => {
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[SUCCESS] Bot is online!')
            );
        });

        it('should log bot tag in connection message', async () => {
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('ApolloBot#1234')
            );
        });

        it('should log bot ID', async () => {
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Bot ID: BOT_ID')
            );
        });

        it('should log number of servers being served', async () => {
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Serving 2 server(s)')
            );
        });

        it('should set bot activity to watching', async () => {
            await readyHandler(mockClient);
            
            expect(mockClient.user.setActivity).toHaveBeenCalledWith({
                name: 'for new members join',
                type: ActivityType.Watching
            });
        });

        it('should log final success message about watching for members', async () => {
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                '[SUCCESS] Bot is now watching for new members...'
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle client with no guilds', async () => {
            mockClient.guilds.cache = new Map();
            
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Serving 0 server(s)')
            );
        });

        it('should handle client with many guilds', async () => {
            const manyGuilds = new Map();
            for (let i = 0; i < 100; i++) {
                manyGuilds.set(`guild${i}`, createMockGuild({ id: `guild${i}` }));
            }
            mockClient.guilds.cache = manyGuilds;
            
            await readyHandler(mockClient);
            
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Serving 100 server(s)')
            );
        });
    });

    describe('Console Output Order', () => {
        it('should log messages in correct order', async () => {
            await readyHandler(mockClient);
            
            const calls = consoleSpy.mock.calls.map(call => call[0]);
            
            expect(calls[0]).toContain('[SUCCESS] Bot is online!');
            expect(calls[1]).toContain('[INFO] Bot ID:');
            expect(calls[2]).toContain('[INFO] Serving');
            expect(calls[3]).toContain('[SUCCESS] Bot is now watching');
        });
    });
});
