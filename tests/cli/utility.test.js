import { describe, it, expect, vi, beforeEach } from 'vitest';
import utilityCommands from '../../src/plugins/utility/cli/index.js';

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    setGuildData: vi.fn()
}));

import { getGuildData, setGuildData } from '../../src/utils/db.js';

describe('utility CLI commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports the utility plugin definition', () => {
        expect(utilityCommands.name).toBe('utility');
        expect(Array.isArray(utilityCommands.commands)).toBe(true);
    });

    it('has a tags command', () => {
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        expect(tags).toBeDefined();
    });

    it('tags command has list, show, create, delete subcommands', () => {
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        expect(tags.subcommands.find(s => s.name === 'list')).toBeDefined();
        expect(tags.subcommands.find(s => s.name === 'show')).toBeDefined();
        expect(tags.subcommands.find(s => s.name === 'create')).toBeDefined();
        expect(tags.subcommands.find(s => s.name === 'delete')).toBeDefined();
    });

    it('show subcommand has required name option', () => {
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const show = tags.subcommands.find(s => s.name === 'show');
        const nameOpt = show.options.find(o => o.name === 'name');
        expect(nameOpt).toBeDefined();
        expect(nameOpt.required).toBe(true);
    });

    it('create subcommand has required name and content options', () => {
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const create = tags.subcommands.find(s => s.name === 'create');
        expect(create.options.find(o => o.name === 'name' && o.required)).toBeDefined();
        expect(create.options.find(o => o.name === 'content' && o.required)).toBeDefined();
    });

    it('delete subcommand has required name option', () => {
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const del = tags.subcommands.find(s => s.name === 'delete');
        const nameOpt = del.options.find(o => o.name === 'name');
        expect(nameOpt).toBeDefined();
        expect(nameOpt.required).toBe(true);
    });

    it('tags list returns tag names', async() => {
        getGuildData.mockResolvedValue({ greeting: { name: 'greeting', content: 'Hello!', createdByTag: 'user' } });
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const list = tags.subcommands.find(s => s.name === 'list');
        const result = await list.execute({ guild: '123' });
        expect(result.count).toBe(1);
        expect(result.tags).toContain('greeting');
    });

    it('tags show returns tag details', async() => {
        getGuildData.mockResolvedValue({ greeting: { name: 'greeting', content: 'Hello!', createdByTag: 'user' } });
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const show = tags.subcommands.find(s => s.name === 'show');
        const result = await show.execute({ guild: '123', name: 'greeting' });
        expect(result.name).toBe('greeting');
        expect(result.content).toBe('Hello!');
    });

    it('tags show returns not found for missing tag', async() => {
        getGuildData.mockResolvedValue({});
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const show = tags.subcommands.find(s => s.name === 'show');
        const result = await show.execute({ guild: '123', name: 'nonexistent' });
        expect(result.success).toBe(false);
    });

    it('tags create creates a new tag', async() => {
        getGuildData.mockResolvedValue({});
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const create = tags.subcommands.find(s => s.name === 'create');
        const result = await create.execute({ guild: '123', name: 'newtag', content: 'New content' });
        expect(result.success).toBe(true);
        expect(setGuildData).toHaveBeenCalled();
    });

    it('tags create rejects duplicate', async() => {
        getGuildData.mockResolvedValue({ newtag: { name: 'newtag' } });
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const create = tags.subcommands.find(s => s.name === 'create');
        const result = await create.execute({ guild: '123', name: 'newtag', content: 'dup' });
        expect(result.success).toBe(false);
    });

    it('tags delete removes a tag', async() => {
        getGuildData.mockResolvedValue({ oldtag: { name: 'oldtag', content: 'bye' } });
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const del = tags.subcommands.find(s => s.name === 'delete');
        const result = await del.execute({ guild: '123', name: 'oldtag' });
        expect(result.success).toBe(true);
        expect(setGuildData).toHaveBeenCalled();
    });

    it('tags delete returns not found for missing tag', async() => {
        getGuildData.mockResolvedValue({});
        const tags = utilityCommands.commands.find(c => c.name === 'tags');
        const del = tags.subcommands.find(s => s.name === 'delete');
        const result = await del.execute({ guild: '123', name: 'nonexistent' });
        expect(result.success).toBe(false);
    });

    it('has an embed command', () => {
        const embed = utilityCommands.commands.find(c => c.name === 'embed');
        expect(embed).toBeDefined();
        expect(embed.needsSocket).toBe(true);
    });

    it('embed command has required channel option', () => {
        const embed = utilityCommands.commands.find(c => c.name === 'embed');
        const channelOpt = embed.options.find(o => o.name === 'channel');
        expect(channelOpt).toBeDefined();
        expect(channelOpt.required).toBe(true);
    });

    it('embed command has file option', () => {
        const embed = utilityCommands.commands.find(c => c.name === 'embed');
        const fileOpt = embed.options.find(o => o.name === 'file');
        expect(fileOpt).toBeDefined();
        expect(fileOpt.required).toBe(false);
    });

    it('embed command has title, description, color, image, thumbnail, footer, author, url, timestamp options', () => {
        const embed = utilityCommands.commands.find(c => c.name === 'embed');
        const optionNames = embed.options.map(o => o.name);
        expect(optionNames).toContain('title');
        expect(optionNames).toContain('description');
        expect(optionNames).toContain('color');
        expect(optionNames).toContain('image');
        expect(optionNames).toContain('thumbnail');
        expect(optionNames).toContain('footer');
        expect(optionNames).toContain('author');
        expect(optionNames).toContain('url');
        expect(optionNames).toContain('timestamp');
    });
});
