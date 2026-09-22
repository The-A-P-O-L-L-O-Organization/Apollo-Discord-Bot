import { randomUUID } from 'node:crypto';
import { getInterlinkClient, generateNonce } from '../connectClient.js';
import { config } from '../../../config/config.js';
import { safeError } from '../../../utils/safeError.js';
import { isOwner, getOwnerIds } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

function selfBotId(): string {
    return config.discord.clientId || 'apollo';
}

function encodePayload(payload: unknown): Uint8Array<ArrayBuffer> {
    if (payload instanceof Uint8Array) { return Uint8Array.from(payload); }
    if (typeof payload === 'string') { return new TextEncoder().encode(payload); }
    return new TextEncoder().encode(JSON.stringify(payload ?? null));
}

export default {
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

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
            } catch (err: unknown) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Command Failed',
                        description: safeError(err)
                    }]
                });
            }

        } catch (error: unknown) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    },

    async _list(interaction: ChatInputCommandInteraction) {
        const response = await getInterlinkClient().listBots();
        const bots = response.bots;
        if (bots.length === 0) {
            return interaction.editReply({
                embeds: [{
                    color: 0x3498DB,
                    title: 'Interlink — Registered Bots',
                    description: 'No bots registered yet. Use `/interlink register` to add one.'
                }]
            });
        }

        const lines = bots.map((bot) => {
            const status = bot.online ? 'Online' : 'Offline';
            const lastSeen = bot.lastHeartbeat !== BigInt(0) ? `\n  Last heartbeat: ${new Date(Number(bot.lastHeartbeat)).toLocaleString()}` : '';
            const endpoint = bot.endpoint ? `\n  Endpoint: ${bot.endpoint}` : '';
            return `**${bot.botId}**${lastSeen}${endpoint}\n  Status: ${status}`;
        });

        return interaction.editReply({
            embeds: [{
                color: 0x3498DB,
                title: `Interlink — Registered Bots (${bots.length})`,
                description: lines.join('\n\n')
            }]
        });
    },

    async _register(interaction: ChatInputCommandInteraction) {
        const name = interaction.options.getString('name', true).trim();
        const webhookUrl = interaction.options.getString('webhook-url', true).trim();
        const description = interaction.options.getString('description')?.trim() ?? '';
        const supportsRedis = interaction.options.getBoolean('redis') ?? false;

        if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid URL', description: 'webhook-url must start with http:// or https://' }]
            });
        }

        const client = getInterlinkClient();
        try {
            await client.getBotInfo(name);
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Already Registered', description: `Bot "${name}" is already registered.` }]
            });
        } catch {
            // Not found — proceed with registration.
        }

        const result = await client.registerBot({
            botId: name,
            publicKey: config.interlink.publicKey,
            endpoint: webhookUrl,
            capabilities: description ? { description } : {},
            maxConcurrentStreams: 100
        });

        if (!result.success) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Registration Failed', description: result.error || `Could not register bot "${name}".` }]
            });
        }

        return interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: '[SUCCESS] Bot Registered',
                description: [
                    `**Name:** ${name}`,
                    `**Endpoint:** ${webhookUrl}`,
                    supportsRedis ? '**Note:** Redis transport retired; bots communicate via the ConnectRPC Go service.' : '',
                    '',
                    'Authentication uses the shared INTERLINK_AUTH_KEY trust domain (no per-bot key).'
                ].filter(Boolean).join('\n')
            }]
        });
    },

    async _remove(interaction: ChatInputCommandInteraction) {
        const name = interaction.options.getString('name', true).trim();
        const client = getInterlinkClient();

        try {
            await client.getBotInfo(name);
        } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Not Found', description: `No bot registered as "${name}".` }]
            });
        }

        await client.unregisterBot(name);

        return interaction.editReply({
            embeds: [{ color: 0x00FF00, title: '[SUCCESS] Bot Removed', description: `Bot "${name}" has been removed from the registry.` }]
        });
    },

    async _send(interaction: ChatInputCommandInteraction) {
        const name = interaction.options.getString('name', true).trim();
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        const client = getInterlinkClient();
        try {
            await client.getBotInfo(name);
        } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] Not Found', description: `No bot registered as "${name}".` }]
            });
        }

        let payload: unknown;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid JSON', description: 'payload must be a valid JSON string.' }]
            });
        }

        const result = await client.send({
            protocol: 'apollo.interlink.v1',
            version: '1.0',
            type,
            source: selfBotId(),
            target: name,
            id: randomUUID(),
            timestamp: BigInt(Date.now()),
            nonce: generateNonce(),
            payload: encodePayload(payload)
        });

        const success = result.accepted;
        const error = result.error || 'Unknown error';

        return interaction.editReply({
            embeds: [{
                color: success ? 0x00FF00 : 0xFF0000,
                title: success ? '[SUCCESS] Message Sent' : '[ERROR] Delivery Failed',
                description: [
                    `**Target:** ${name}`,
                    `**Type:** ${type}`,
                    `**Result:** ${success ? 'Accepted (at-most-once delivery)' : error}`
                ].join('\n')
            }]
        });
    },

    async _broadcast(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        let payload: unknown;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Invalid JSON', description: 'payload must be a valid JSON string.' }]
            });
        }

        const listing = await getInterlinkClient().listBots();
        const targets = listing.bots.filter((b) => b.online && b.botId !== selfBotId());

        if (targets.length === 0) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] No Bots', description: 'No online registered bots to broadcast to.' }]
            });
        }

        const result = await getInterlinkClient().send({
            protocol: 'apollo.interlink.v1',
            version: '1.0',
            type,
            source: selfBotId(),
            target: '*',
            id: randomUUID(),
            timestamp: BigInt(Date.now()),
            nonce: generateNonce(),
            payload: encodePayload(payload)
        });

        const success = result.accepted;
        return interaction.editReply({
            embeds: [{
                color: success ? 0x00FF00 : 0xFF0000,
                title: '[INFO] Broadcast Complete',
                description: success
                    ? `Broadcast accepted for ${targets.length} online bot(s) (at-most-once delivery).`
                    : `Broadcast rejected: ${result.error || 'Unknown error'}`
            }]
        });
    },

    async _rotateKey(interaction: ChatInputCommandInteraction) {
        const name = interaction.options.getString('name', true).trim();
        logger.warn(`[INTERLINK] rotate-key requested for ${name}: per-bot API keys retired with the Express stack`);
        return interaction.editReply({
            embeds: [{
                color: 0xFFA500,
                title: '[WARNING] Key Rotation Retired',
                description: [
                    `Per-bot API keys were retired with the Express stack; bot "${name}" has no key to rotate.`,
                    'Interlink now authenticates via the shared INTERLINK_AUTH_KEY trust domain.',
                    'To rotate: generate a new secret, set it on every bot plus the Go service, and restart.'
                ].join('\n')
            }]
        });
    },

    async _override(interaction: ChatInputCommandInteraction) {
        const listing = await getInterlinkClient().listBots();
        const active = listing.bots.filter((b) => b.online && b.botId !== selfBotId());

        if (active.length === 0) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: '[WARNING] No Bots', description: 'No online registered bots to override.' }]
            });
        }

        const ownerIds = getOwnerIds();
        const userId = interaction.options.getString('user-id') ?? ownerIds[0] ?? '';

        if (!userId) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] No User ID', description: 'Could not determine target user ID. Set OWNER_IDS or provide a user-id.' }]
            });
        }

        const result = await getInterlinkClient().send({
            protocol: 'apollo.interlink.v1',
            version: '1.0',
            type: 'command',
            source: selfBotId(),
            target: '*',
            id: randomUUID(),
            timestamp: BigInt(Date.now()),
            nonce: generateNonce(),
            payload: encodePayload({ command: 'override', action: 'activate', userId })
        });

        if (!result.accepted) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: '[ERROR] Override Failed', description: result.error || 'Broadcast rejected by the Interlink service.' }]
            });
        }

        const lines = active.map((b) => `**${b.botId}:** Override broadcast accepted`);

        return interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: '[INFO] Override Broadcast Complete',
                description: [
                    `Target user: \`${userId}\``,
                    `Sent to ${active.length} online bot(s) (at-most-once delivery).`,
                    '',
                    ...lines
                ].filter(Boolean).join('\n')
            }]
        });
    }
};
