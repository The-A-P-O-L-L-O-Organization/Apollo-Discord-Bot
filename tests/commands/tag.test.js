// Tag Command Tests
// Tests for the tag command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import tagCommand from '../../src/plugins/utility/commands/tag.js';
import { createMockInteraction, createMockUser, createMockMember, createMockChannel, createMockGuild } from '../mocks/discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/db.js';

vi.mock('discord.js', () => ({
    PermissionsBitField: {
        Flags: {
            ManageMessages: 'ManageMessages'
        }
    }
}));

describe('Tag Command', () => {
    let mockInteraction;
    let existingTags;

    beforeEach(() => {
        getGuildData.mockClear();
        setGuildData.mockClear();

        existingTags = {
            welcome: {
                name: 'welcome',
                content: 'Welcome {user} to {server}!',
                createdBy: '111',
                createdByTag: 'TestUser#0001',
                createdAt: Date.now(),
                usageCount: 2
            }
        };

        getGuildData.mockResolvedValue(existingTags);
        setGuildData.mockResolvedValue();

        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '111222333444555666', username: 'Tester', tag: 'Tester#0001' }),
            member: createMockMember({
                permissions: {
                    has: vi.fn().mockReturnValue(true)
                }
            }),
            channel: createMockChannel({ id: 'ch123', name: 'general' }),
            guild: createMockGuild({ id: 'guild1', name: 'Test Server', memberCount: 42 }),
            options: {
                getString: vi.fn().mockReturnValue('welcome'),
                getSubcommand: vi.fn()
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(tagCommand.name).toBe('tag');
        });

        it('should have a description', () => {
            expect(tagCommand.description).toBeTruthy();
        });

        it('should be in Utility category', () => {
            expect(tagCommand.category).toBe('Utility');
        });

        it('should not allow DMs', () => {
            expect(tagCommand.dmPermission).toBe(false);
        });
    });

    describe('create', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('create');
        });

        it('should create a new tag', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'rules';}
                if (name === 'content') {return 'Follow the rules!';}
                if (name === 'embed') {return null;}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            expect(setGuildData).toHaveBeenCalled();
            const [store, guildId, data] = setGuildData.mock.calls[0];
            expect(store).toBe('tags');
            expect(guildId).toBe('guild1');
            expect(data.rules).toBeDefined();
            expect(data.rules.content).toBe('Follow the rules!');
            expect(data.rules.usageCount).toBe(0);
            expect(data.welcome).toBeDefined();
        });

        it('should reject existing tag names', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'welcome';}
                if (name === 'content') {return 'duplicate';}
                if (name === 'embed') {return null;}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Tag Exists');
        });

        it('should require Manage Messages permission', async() => {
            mockInteraction.member.permissions.has.mockReturnValue(false);

            await tagCommand.execute(mockInteraction);

            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Permission Required');
        });

        it('should reject invalid embed JSON', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'rules';}
                if (name === 'content') {return 'content';}
                if (name === 'embed') {return '{not valid json';}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Invalid Embed JSON');
        });

        it('should store parsed embed data', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'announce';}
                if (name === 'content') {
                    return 'Important announcement';
                }
                if (name === 'embed') {return JSON.stringify({ title: 'News', color: '#FF0000' });}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            const [, , data] = setGuildData.mock.calls[0];
            expect(data.announce.embed).toEqual({ title: 'News', color: '#FF0000' });
        });

        it('should reject embed JSON larger than 2KB', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'big';}
                if (name === 'content') {return 'content';}
                if (name === 'embed') {return JSON.stringify({ title: 'x'.repeat(3000) });}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Embed Too Large');
        });

        it('should strip non-whitelisted embed keys', async() => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'name') {return 'clean';}
                if (name === 'content') {return 'content';}
                if (name === 'embed') {return JSON.stringify({ title: 'T', description: 'D', arbitraryKey: 'drop me', nested: { x: 1 } });}
                return null;
            });

            await tagCommand.execute(mockInteraction);

            const [, , data] = setGuildData.mock.calls[0];
            expect(data.clean.embed).toEqual({ title: 'T', description: 'D' });
        });
    });

    describe('show', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('show');
        });

        it('should render tag content', async() => {
            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toBe('Welcome <@111222333444555666> to Test Server!');
        });

        it('should increment usage count', async() => {
            await tagCommand.execute(mockInteraction);

            const [, , data] = setGuildData.mock.calls[0];
            expect(data.welcome.usageCount).toBe(3);
        });

        it('should render embeds when tag has embed data', async() => {
            existingTags.announce = {
                name: 'announce',
                content: 'Read this',
                embed: { title: 'News', description: 'Big update', color: '#00FF00' },
                createdBy: '111',
                createdByTag: 'TestUser#0001',
                createdAt: Date.now(),
                usageCount: 0
            };

            mockInteraction.options.getString.mockReturnValue('announce');

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toHaveLength(1);
            expect(replyCall.embeds[0].title).toBe('News');
            expect(replyCall.embeds[0].description).toBe('Big update');
            expect(replyCall.embeds[0].color).toBe(0x00FF00);
        });

        it('should handle missing tag', async() => {
            mockInteraction.options.getString.mockReturnValue('nonexistent');

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Tag Not Found');
        });
    });

    describe('delete', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('delete');
        });

        it('should delete a tag', async() => {
            await tagCommand.execute(mockInteraction);

            const [, , data] = setGuildData.mock.calls[0];
            expect(data.welcome).toBeUndefined();
        });

        it('should require Manage Messages permission', async() => {
            mockInteraction.member.permissions.has.mockReturnValue(false);

            await tagCommand.execute(mockInteraction);

            expect(setGuildData).not.toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Permission Required');
        });

        it('should reject missing tags', async() => {
            mockInteraction.options.getString.mockReturnValue('nonexistent');

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Tag Not Found');
        });
    });

    describe('list', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('list');
        });

        it('should list all tags', async() => {
            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].fields.length).toBeGreaterThan(0);
            expect(replyCall.embeds[0].description).toBe('Total: 1');
        });

        it('should handle empty tag list', async() => {
            getGuildData.mockResolvedValue({});

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('No Tags');
        });
    });

    describe('info', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('info');
        });

        it('should show tag info', async() => {
            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            expect(embed.title).toContain('welcome');
            expect(embed.fields).toContainEqual(expect.objectContaining({ value: '2 times' }));
        });

        it('should handle missing tag', async() => {
            mockInteraction.options.getString.mockReturnValue('nonexistent');

            await tagCommand.execute(mockInteraction);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].title).toContain('Tag Not Found');
        });
    });
});
