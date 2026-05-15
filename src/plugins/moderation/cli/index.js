import { getGuildData } from '../../../utils/db.js';

export default {
    name: 'moderation',
    description: 'Moderation commands',
    commands: [
        {
            name: 'ban',
            description: 'Ban a user',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true },
                { name: 'reason', description: 'Ban reason', required: false }
            ]
        },
        {
            name: 'kick',
            description: 'Kick a user',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true },
                { name: 'reason', description: 'Kick reason', required: false }
            ]
        },
        {
            name: 'mute',
            description: 'Mute a user',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true },
                { name: 'duration', description: 'Mute duration (e.g. 1h, 30m)', required: false },
                { name: 'reason', description: 'Mute reason', required: false }
            ]
        },
        {
            name: 'warn',
            description: 'Warn a user',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true },
                { name: 'reason', description: 'Warning reason', required: true }
            ]
        },
        {
            name: 'case',
            description: 'Look up a moderation case',
            options: [
                { name: 'id', description: 'Case ID', required: true }
            ],
            execute: async (args) => {
                const data = await getGuildData('moderation', args.guild);
                const cases = (data && data.cases) || [];
                const c = cases.find(x => x.id === args.id);
                if (!c) return { success: false, message: `Case "${args.id}" not found` };
                return c;
            }
        },
        {
            name: 'clear',
            description: 'Clear messages',
            needsSocket: true,
            options: [
                { name: 'count', description: 'Number of messages to clear', required: true }
            ]
        },
        {
            name: 'slowmode',
            description: 'Set slowmode',
            needsSocket: true,
            options: [
                { name: 'seconds', description: 'Seconds between messages', required: true }
            ]
        },
        {
            name: 'lockdown',
            description: 'Lockdown a channel',
            needsSocket: true,
            options: [
                { name: 'channel', description: 'Channel ID', required: false },
                { name: 'action', description: 'lock or unlock', required: false, choices: ['lock', 'unlock'] }
            ]
        }
    ]
};
