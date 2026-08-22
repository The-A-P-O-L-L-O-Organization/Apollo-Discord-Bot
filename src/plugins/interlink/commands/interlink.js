import { getDb } from '../../../db/knex.js';
import BotRegistry from '../registry.js';
import MessageBus from '../messageBus.js';
import { generateApiKey } from '../auth.js';
import { safeError } from '../../../utils/safeError.js';
import { isOwner, getOwnerIds } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from './utils/logger.js';

const SEND_CONFIG = { requestTimeout: 5000, maxRetries: 3 };

function createRegistry() {
    return new BotRegistry(getDb());
}

function createBus() {
    return new MessageBus({ registry: createRegistry(), config: SEND_CONFIG });
}

export default {
import { logger } from '../../../utils/logger.js';
    name: 'interlink',
    description: 'Manage cross-bot communication (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    options: [
        {
            name: 'list',
            description: 'Show all registered bots',
            type: 1
        },
        {
            name: 'register',
            description: 'Register a new external bot',
            type: 1,
            options: [
                { name: 'name', description: 'Bot identifier', type: 3, required: true },
                { name: 'webhook-url', description: 'HTTP endpoint for messages', type: 3, required: true },
                { name: 'description', description: 'Optional description', type: 3, required: false },
                { name: 'redis', description: 'Supports Redis transport', type: 5, required: false }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a registered bot',
            type: 1,
            options: [
                { name: 'name', description: 'Bot name to remove', type: 3, required: true }
            ]
        },
        {
            name: 'send',
            description: 'Send a message to a registered bot',
            type: 1,
            options: [
                { name: 'name', description: 'Target bot name', type: 3, required: true },
                { name: 'type', description: 'Message type', type: 3, required: true, choices: [
                    { name: 'ping', value: 'ping' },
                    { name: 'command', value: 'command' },
                    { name: 'event', value: 'event' },
                    { name: 'custom', value: 'custom' }
                ] },
                { name: 'payload', description: 'JSON payload (valid JSON string)', type: 3, required: true }
            ]
        },
        {
            name: 'broadcast',
            description: 'Send a message to all active registered bots',
            type: 1,
            options: [
                { name: 'type', description: 'Message type', type: 3, required: true, choices: [
                    { name: 'ping', value: 'ping' },
                    { name: 'command', value: 'command' },
                    { name: 'event', value: 'event' },
                    { name: 'custom', value: 'custom' }
                ] },
                { name: 'payload', description: 'JSON payload (valid JSON string)', type: 3, required: true }
            ]
        },
        {
            name: 'rotate-key',
            description: 'Regenerate API key for a bot (old key invalidated immediately)',
            type: 1,
            options: [
                { name: 'name', description: 'Bot name', type: 3, required: true }
            ]
        },
        {
            name: 'override',
            description: 'Activate override mode on all registered bots (owner only)',
            type: 1,
            options: [
                { name: 'user-id', description: 'Discord user ID to activate override for (default: OWNER_IDS first entry)', type: 3, required: false }
            ]
        }
    ],

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: 64 });

            if (!isOwner(interaction.user.id)) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Access Denied',
                        description: 'Only bot owners can use this command.'
                    }]
                });
            }

            const sub = interaction.options.getSubcommand();

            try {
                switch (sub) {
                case 'list':
                    return await this._list(interaction);
                case 'register':
                    return await this._register(interaction);
                case 'remove':
                    return await this._remove(interaction);
                case 'send':
                    return await this._send(interaction);
                case 'broadcast':
                    return await this._broadcast(interaction);
                case 'rotate-key':
                    return await this._rotateKey(interaction);
                case 'override':
                    return await this._override(interaction);
                default:
                    return interaction.editReply({ embeds: [{ color: 0xFF0000, title: '[ERROR] Unknown subcommand' }] });
                }
            } catch (err) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Command Failed',
                        description: safeError(err)
                    }]
                });
            }
    
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    },

    async _list(interaction) {
        const bots = await createRegistry().list();
        if (bots.length === 0) {
            return interaction.editReply({
                embeds: [{
                    color: 0x3498DB,
                    title: 'Interlink — Registered Bots',
                    description: 'No bots registered yet. Use `/interlink register` to add one.'
                }]
            });
        }

        const lines = bots.map(bot => {
            const status = bot.is_active ? 'Active' : 'Inactive';
            const redis = bot.supports_redis ? ' +Redis' : '';
            const lastSeen = bot.last_seen_at ? `\n  Last seen: ${new Date(bot.last_seen_at).toLocaleString()}` : '';
            return `**${bot.name}**${lastSeen}\n  Status: ${status}${redis}\n  Key prefix: \`${bot.api_key_prefix}\``;
        });

        return interaction.editReply({
            embeds: [{
                color: 0x3498DB,
                title: `Interlink — Registered Bots (${bots.length})`,
                description: lines.join('\n\n')
            }]
        });
    },

    async _register(interaction) {
        const name = interaction.options.getString('name', true).trim();
        const webhookUrl = interaction.options.getString('webhook-url', true).trim();
        const description = interaction.options.getString('description')?.trim() || '';
        const supportsRedis = interaction.options.getBoolean('redis') || false;

        if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid URL', description: 'webhook-url must start with http:// or https://' }]
            });
        }

        const existing = await createRegistry().get(name);
        if (existing) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Already Registered', description: `Bot "${name}" is already registered.` }]
            });
        }

        const result = await createRegistry().create({ name, webhookUrl, description, supportsRedis });

        await interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Bot Registered',
                description: [
                    `**Name:** ${name}`,
                    `**Webhook:** ${webhookUrl}`,
                    `**Redis:** ${supportsRedis ? 'Yes' : 'No'}`,
                    '',
                    'API key sent via DM.'
                ].join('\n'),
                fields: [{
                    name: 'Key Prefix',
                    value: `\`${result.api_key_prefix}\``,
                    inline: true
                }]
            }]
        });

        // Send API key via DM instead of followUp to avoid exposure in channel logs
        try {
            await interaction.user.send({
                content: `**[WARNING] API Key for ${name} (shown once):**\n\`\`\`${result.rawKey}\`\`\`\nStore this securely. It will not be shown again.`
            });
        } catch (dmError) {
            // Fallback to ephemeral followUp if DM fails
            logger.warn(`[INTERLINK] Failed to DM API key to ${interaction.user.tag}, falling back to ephemeral message: ${dmError.message}`);
            await interaction.followUp({
                content: `**[WARNING] API Key for ${name} (shown once):**\n\`\`\`${result.rawKey}\`\`\`\nStore this securely. It will not be shown again.`,
                flags: 64
            });
        }
    },

    async _remove(interaction) {
        const name = interaction.options.getString('name', true).trim();
        const existing = await createRegistry().get(name);

        if (!existing) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Not Found', description: `No bot registered as "${name}".` }]
            });
        }

        await createRegistry().remove(name);

        return interaction.editReply({
            embeds: [{ color: 0x00FF00, title: '[SUCCESS] Bot Removed', description: `Bot "${name}" has been removed from the registry.` }]
        });
    },

    async _send(interaction) {
        const name = interaction.options.getString('name', true).trim();
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        const existing = await createRegistry().get(name);
        if (!existing) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Not Found', description: `No bot registered as "${name}".` }]
            });
        }

        let payload;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid JSON', description: 'payload must be a valid JSON string.' }]
            });
        }

        const bus = createBus();
        const result = await bus.send(name, type, payload);

        return interaction.editReply({
            embeds: [{
                color: result.success ? 0x00FF00 : 0xFF0000,
                title: result.success ? '[SUCCESS] Message Sent' : '[ERROR] Delivery Failed',
                description: [
                    `**Target:** ${name}`,
                    `**Type:** ${type}`,
                    `**Result:** ${result.success ? 'Delivered' : result.error}`
                ].join('\n')
            }]
        });
    },

    async _broadcast(interaction) {
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        let payload;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid JSON', description: 'payload must be a valid JSON string.' }]
            });
        }

        const bus = createBus();
        const results = await bus.broadcast(type, payload);
        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        return interaction.editReply({
            embeds: [{
                color: failed === 0 ? 0x00FF00 : 0xFFA500,
                title: '[INFO] Broadcast Complete',
                description: `Sent to ${results.length} active bot(s).\n✅ ${success} succeeded\n❌ ${failed} failed`
            }]
        });
    },

    async _rotateKey(interaction) {
        const name = interaction.options.getString('name', true).trim();
        const existing = await createRegistry().get(name);

        if (!existing) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Not Found', description: `No bot registered as "${name}".` }]
            });
        }

        const { rawKey } = await createRegistry().rotateKey(name);

        await interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] API Key Rotated',
                description: [
                    `**Bot:** ${name}`,
                    '',
                    'New API key sent via DM.'
                ].join('\n'),
                fields: [{ name: 'New Key Prefix', value: `\`${rawKey.slice(0, 8)}\``, inline: true }]
            }]
        });

        // Send API key via DM instead of followUp to avoid exposure in channel logs
        try {
            await interaction.user.send({
                content: `**[WARNING] New API Key for ${name} (shown once):**\n\`\`\`${rawKey}\`\`\`\nStore this securely. The old key is no longer valid.`
            });
        } catch (dmError) {
            // Fallback to ephemeral followUp if DM fails
            logger.warn(`[INTERLINK] Failed to DM API key to ${interaction.user.tag}, falling back to ephemeral message: ${dmError.message}`);
            await interaction.followUp({
                content: `**[WARNING] New API Key for ${name} (shown once):**\n\`\`\`${rawKey}\`\`\`\nStore this securely. The old key is no longer valid.`,
                flags: 64
            });
        }
    },

    async _override(interaction) {
        const registry = createRegistry();
        const bots = await registry.list();
        const active = bots.filter(b => b.is_active);

        if (active.length === 0) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] No Bots', description: 'No active registered bots to override.' }]
            });
        }

        const ownerIds = getOwnerIds();
        const userId = interaction.options.getString('user-id') || ownerIds[0] || '';

        if (!userId) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] No User ID', description: 'Could not determine target user ID. Set OWNER_IDS or provide a user-id.' }]
            });
        }

        const bus = createBus();
        const results = await bus.broadcast('command', {
            command: 'override',
            action: 'activate',
            userId
        });

        const success = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        const lines = results.map(r =>
            `**${r.name}:** ${r.success ? 'Override activated' : `Failed: ${r.error}`}`
        );

        return interaction.editReply({
            embeds: [{
                color: failed === 0 ? 0x00FF00 : 0xFFA500,
                title: '[INFO] Override Broadcast Complete',
                description: [
                    `Target user: \`${userId}\``,
                    `Sent to ${results.length} active bot(s).`,
                    `${success} succeeded`,
                    failed > 0 ? `${failed} failed` : '',
                    '',
                    ...lines
                ].filter(Boolean).join('\n')
            }]
        });
    }
};
