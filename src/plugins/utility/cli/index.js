import { getGuildData, setGuildData } from '../../../utils/db.js';

export default {
    name: 'utility',
    description: 'Utility commands',
    commands: [
        {
            name: 'tags',
            description: 'Manage server tags',
            options: [],
            subcommands: [
                {
                    name: 'list',
                    description: 'List all tags',
                    options: [],
                    execute: async (args) => {
                        const data = await getGuildData('tags', args.guild);
                        const tagNames = Object.keys(data || {});
                        return { count: tagNames.length, tags: tagNames };
                    }
                },
                {
                    name: 'show',
                    description: 'Show a tag',
                    options: [{ name: 'name', description: 'Tag name', required: true }],
                    execute: async (args) => {
                        const data = await getGuildData('tags', args.guild);
                        const tag = (data || {})[args.name.toLowerCase()];
                        if (!tag) return { success: false, message: `Tag "${args.name}" not found` };
                        return { name: tag.name, content: tag.content, createdBy: tag.createdByTag };
                    }
                },
                {
                    name: 'create',
                    description: 'Create a tag',
                    options: [
                        { name: 'name', description: 'Tag name', required: true },
                        { name: 'content', description: 'Tag content', required: true }
                    ],
                    execute: async (args) => {
                        const data = await getGuildData('tags', args.guild) || {};
                        const name = args.name.toLowerCase();
                        if (data[name]) return { success: false, message: `Tag "${name}" already exists` };
                        data[name] = {
                            name,
                            content: args.content,
                            createdBy: 'cli',
                            createdByTag: 'CLI',
                            createdAt: Date.now(),
                            usageCount: 0
                        };
                        await setGuildData('tags', args.guild, data);
                        return { success: true, message: `Tag "${name}" created` };
                    }
                },
                {
                    name: 'delete',
                    description: 'Delete a tag',
                    options: [{ name: 'name', description: 'Tag name', required: true }],
                    execute: async (args) => {
                        const data = await getGuildData('tags', args.guild) || {};
                        const name = args.name.toLowerCase();
                        if (!data[name]) return { success: false, message: `Tag "${name}" not found` };
                        delete data[name];
                        await setGuildData('tags', args.guild, data);
                        return { success: true, message: `Tag "${name}" deleted` };
                    }
                }
            ]
        },
        {
            name: 'serverinfo',
            description: 'Show server information',
            needsSocket: true,
            options: []
        },
        {
            name: 'userinfo',
            description: 'Show user information',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true }
            ]
        },
        {
            name: 'ping',
            description: 'Check bot latency',
            needsSocket: true,
            options: []
        },
        {
            name: 'embed',
            description: 'Send an embed message to a channel',
            needsSocket: true,
            options: [
                { name: 'channel', description: 'Channel ID to send to', required: true },
                { name: 'title', description: 'Embed title', required: false },
                { name: 'description', description: 'Embed description', required: false },
                { name: 'color', description: 'Hex color (e.g. #FF0000)', required: false },
                { name: 'image', description: 'Image URL', required: false },
                { name: 'thumbnail', description: 'Thumbnail URL', required: false },
                { name: 'footer', description: 'Footer text', required: false },
                { name: 'author', description: 'Author name', required: false },
                { name: 'url', description: 'Title link URL', required: false },
                { name: 'timestamp', description: 'Add timestamp (true/false)', required: false },
                { name: 'file', description: 'Path to .md file on disk', required: false }
            ]
        }
    ]
};
