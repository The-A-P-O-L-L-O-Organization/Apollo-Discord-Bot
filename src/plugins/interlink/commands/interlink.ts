import { randomUUID } from 'node:crypto';
import { getInterlinkClient, generateNonce } from '../connectClient.js';
import { config } from '../../../config/config.js';
import { safeError } from '../../../utils/safeError.js';
import { isOwner, getOwnerIds } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'interlink');

            if (!isOwner(interaction.user.id)) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('interlink.accessDeniedTitle'),
                        description: t('interlink.accessDenied')
                    }]
                });
            }

            const sub = interaction.options.getSubcommand();

            try {
                switch (sub) {
                case 'list':
                    return await this._list(interaction, t);
                case 'register':
                    return await this._register(interaction, t);
                case 'remove':
                    return await this._remove(interaction, t);
                case 'send':
                    return await this._send(interaction, t);
                case 'broadcast':
                    return await this._broadcast(interaction, t);
                case 'rotate-key':
                    return await this._rotateKey(interaction, t);
                case 'override':
                    return await this._override(interaction, t);
                default:
                    return interaction.editReply({ embeds: [{ color: 0xFF0000, title: t('interlink.unknownSubcommand') }] });
                }
            } catch (err: unknown) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('interlink.failedTitle'),
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

    async _list(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const response = await getInterlinkClient().listBots();
        const bots = response.bots;
        if (bots.length === 0) {
            return interaction.editReply({
                embeds: [{
                    color: 0x3498DB,
                    title: t('interlink.listTitle'),
                    description: t('interlink.listEmpty')
                }]
            });
        }

        const lines = bots.map((bot) => {
            const status = bot.online ? t('interlink.online') : t('interlink.offline');
            const lastSeen = bot.lastHeartbeat !== BigInt(0) ? `\n  ${t('interlink.lastHeartbeat', { when: new Date(Number(bot.lastHeartbeat)).toLocaleString() })}` : '';
            const endpoint = bot.endpoint ? `\n  ${t('interlink.endpoint', { endpoint: bot.endpoint })}` : '';
            return `**${bot.botId}**${lastSeen}${endpoint}\n  ${t('interlink.status', { status })}`;
        });

        return interaction.editReply({
            embeds: [{
                color: 0x3498DB,
                title: t('interlink.listTitleCount', { count: bots.length }),
                description: lines.join('\n\n')
            }]
        });
    },

    async _register(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const name = interaction.options.getString('name', true).trim();
        const webhookUrl = interaction.options.getString('webhook-url', true).trim();
        const description = interaction.options.getString('description')?.trim() ?? '';
        const supportsRedis = interaction.options.getBoolean('redis') ?? false;

        if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: t('interlink.invalidUrlTitle'), description: t('interlink.invalidUrl') }]
            });
        }

        const client = getInterlinkClient();
        try {
            await client.getBotInfo(name);
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: t('interlink.alreadyTitle'), description: t('interlink.already', { name }) }]
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
                embeds: [{ color: 0xFF0000, title: t('interlink.regFailedTitle'), description: result.error || t('interlink.regFailed', { name }) }]
            });
        }

        return interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: t('interlink.registeredTitle'),
                description: [
                    t('interlink.registeredName', { name }),
                    t('interlink.registeredEndpoint', { endpoint: webhookUrl }),
                    supportsRedis ? t('interlink.redisNote') : '',
                    '',
                    t('interlink.authNote')
                ].filter(Boolean).join('\n')
            }]
        });
    },

    async _remove(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const name = interaction.options.getString('name', true).trim();
        const client = getInterlinkClient();

        try {
            await client.getBotInfo(name);
        } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: t('interlink.notFoundTitle'), description: t('interlink.notFound', { name }) }]
            });
        }

        await client.unregisterBot(name);

        return interaction.editReply({
            embeds: [{ color: 0x00FF00, title: t('interlink.removedTitle'), description: t('interlink.removed', { name }) }]
        });
    },

    async _send(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const name = interaction.options.getString('name', true).trim();
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        const client = getInterlinkClient();
        try {
            await client.getBotInfo(name);
        } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: t('interlink.notFoundTitle'), description: t('interlink.notFound', { name }) }]
            });
        }

        let payload: unknown;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: t('interlink.invalidJsonTitle'), description: t('interlink.invalidJson') }]
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
        const error = result.error || t('interlink.unknownError');

        return interaction.editReply({
            embeds: [{
                color: success ? 0x00FF00 : 0xFF0000,
                title: success ? t('interlink.sentTitle') : t('interlink.failedSendTitle'),
                description: [
                    t('interlink.sentTarget', { name }),
                    t('interlink.sentType', { type }),
                    t('interlink.sentResult', { result: success ? t('interlink.acceptedResult') : error })
                ].join('\n')
            }]
        });
    },

    async _broadcast(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const type = interaction.options.getString('type', true);
        const payloadStr = interaction.options.getString('payload', true);

        let payload: unknown;
        try { payload = JSON.parse(payloadStr); } catch {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: t('interlink.invalidJsonTitle'), description: t('interlink.invalidJson') }]
            });
        }

        const listing = await getInterlinkClient().listBots();
        const targets = listing.bots.filter((b) => b.online && b.botId !== selfBotId());

        if (targets.length === 0) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: t('interlink.noBotsTitle'), description: t('interlink.noBroadcastTargets') }]
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
                title: t('interlink.broadcastTitle'),
                description: success
                    ? t('interlink.broadcastAccepted', { count: targets.length })
                    : t('interlink.broadcastRejected', { error: result.error || t('interlink.unknownError') })
            }]
        });
    },

    async _rotateKey(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const name = interaction.options.getString('name', true).trim();
        logger.warn(`[INTERLINK] rotate-key requested for ${name}: per-bot API keys retired with the Express stack`);
        return interaction.editReply({
            embeds: [{
                color: 0xFFA500,
                title: t('interlink.keyRetiredTitle'),
                description: t('interlink.keyRetired', { name })
            }]
        });
    },

    async _override(interaction: ChatInputCommandInteraction, t: ReturnType<typeof i18n.getFixedT>) {
        const listing = await getInterlinkClient().listBots();
        const active = listing.bots.filter((b) => b.online && b.botId !== selfBotId());

        if (active.length === 0) {
            return interaction.editReply({
                embeds: [{ color: 0xFFA500, title: t('interlink.noBotsTitle'), description: t('interlink.noOverrideTargets') }]
            });
        }

        const ownerIds = getOwnerIds();
        const userId = interaction.options.getString('user-id') ?? ownerIds[0] ?? '';

        if (!userId) {
            return interaction.editReply({
                embeds: [{ color: 0xFF0000, title: t('interlink.noUserTitle'), description: t('interlink.noUser') }]
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
                embeds: [{ color: 0xFF0000, title: t('interlink.overrideFailedTitle'), description: result.error || t('interlink.overrideFailed') }]
            });
        }

        const lines = active.map((b) => t('interlink.overrideLine', { bot: b.botId }));

        return interaction.editReply({
            embeds: [{
                color: 0x00FF00,
                title: t('interlink.overrideTitle'),
                description: [
                    t('interlink.overrideTarget', { user: userId }),
                    t('interlink.overrideSent', { count: active.length }),
                    '',
                    ...lines
                ].filter(Boolean).join('\n')
            }]
        });
    }
};
