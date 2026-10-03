import { getData } from '../../../utils/db.js';

interface IntegrationSubscription {
    id: string;
    guild_id: string;
    type: string;
    target_id: string;
    channel_id: string;
}

export default {
    name: 'integrations',
    description: 'Integration management',
    commands: [
        {
            name: 'list',
            description: 'List all integrations',
            options: [],
            execute: async (_args: unknown) => {
                const data = await getData('integrations') || {};
                const subs = ((data['subscriptions'] as IntegrationSubscription[]) || []).map(s => ({
                    id: s.id,
                    guild_id: s.guild_id,
                    type: s.type,
                    target_id: s.target_id,
                    channel_id: s.channel_id
                }));
                return { count: subs.length, subscriptions: subs };
            }
        },
        {
            name: 'add',
            description: 'Add an integration',
            needsSocket: true,
            options: [
                { name: 'type', description: 'Integration type', required: true },
                { name: 'channel', description: 'Channel ID', required: true },
                { name: 'target', description: 'Target ID/URL', required: false }
            ]
        },
        {
            name: 'remove',
            description: 'Remove an integration',
            needsSocket: true,
            options: [
                { name: 'id', description: 'Integration ID', required: true }
            ]
        }
    ]
};