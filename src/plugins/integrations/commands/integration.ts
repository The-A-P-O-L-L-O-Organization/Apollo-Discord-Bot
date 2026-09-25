import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { getData, setData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

async function resolveT(interaction: any) {
    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    return i18n.getFixedT(resolvedLocale, 'integrations');
}

export default {
    name: 'integration',
    description: 'Manage external integrations (Twitch, YouTube, GitHub, RSS)',
    category: 'integrations',
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add an integration subscription',
            type: 1,
            options: [
                {
                    name: 'type',
                    description: 'Integration type',
                    type: 3,
                    required: true,
                    choices: [
                        { name: 'Twitch', value: 'twitch' },
                        { name: 'YouTube', value: 'youtube' },
                        { name: 'GitHub', value: 'github' },
                        { name: 'RSS', value: 'rss' }
                    ]
                },
                {
                    name: 'target',
                    description: 'Streamer name, channel ID, repo (owner/repo), or feed URL',
                    type: 3,
                    required: true
                },
                {
                    name: 'channel',
                    description: 'Channel to post notifications',
                    type: 7,
                    required: true
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove an integration subscription',
            type: 1,
            options: [
                {
                    name: 'id',
                    description: 'Subscription ID (use /integration list)',
                    type: 4,
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List all integration subscriptions in this server',
            type: 1
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
            case 'add':
                return handleAdd(interaction);
            case 'remove':
                return handleRemove(interaction);
            case 'list':
                return handleList(interaction);
            }

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleAdd(interaction: any): Promise<void> {
    const t = await resolveT(interaction);
    const type = interaction.options.getString('type');
    const target = interaction.options.getString('target');
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
        return interaction.reply({ content: t('integration.textChannel'), flags: MessageFlags.Ephemeral });
    }

    const data = (await getData('integrations')) || { nextId: 1, subscriptions: [] };

    const id = (data['nextId'] as number)++;
    (data['subscriptions'] as any[]).push({
        id,
        guild_id: interaction.guildId,
        channel_id: channel.id,
        type,
        target_id: target,
        config: {},
        last_checked: null,
        created_at: new Date().toISOString()
    });

    await setData('integrations', data);

    const typeNames = { twitch: 'Twitch', youtube: 'YouTube', github: 'GitHub', rss: 'RSS' };

    await interaction.reply({
        content: t('integration.added', { type: typeNames[type as keyof typeof typeNames] || type, target, channel: String(channel), id }),
        flags: MessageFlags.Ephemeral
    });
}

async function handleRemove(interaction: any): Promise<void> {
    const t = await resolveT(interaction);
    const id = interaction.options.getInteger('id');
    const data = (await getData('integrations')) || { nextId: 1, subscriptions: [] };

    const idx = (data['subscriptions'] as any[]).findIndex(
        s => s.id === id && s.guild_id === interaction.guildId
    );

    if (idx === -1) {
        return interaction.reply({ content: t('integration.notFound', { id }), flags: MessageFlags.Ephemeral });
    }

    (data['subscriptions'] as any[]).splice(idx, 1);
    await setData('integrations', data);

    await interaction.reply({ content: t('integration.removed', { id }), flags: MessageFlags.Ephemeral });
}

async function handleList(interaction: any): Promise<void> {
    const t = await resolveT(interaction);
    const data = (await getData('integrations')) || { nextId: 1, subscriptions: [] };

    const guildSubs = (data['subscriptions'] as any[]).filter(s => s.guild_id === interaction.guildId);

    if (guildSubs.length === 0) {
        return interaction.reply({ content: t('integration.empty'), flags: MessageFlags.Ephemeral });
    }

    const lines = guildSubs.map(s =>
        `\`${s.id}\` | **${s.type}** | \`${s.target_id}\` | <#${s.channel_id}>`
    );

    await interaction.reply({
        embeds: [{
            color: 0x5865F2,
            title: t('integration.title'),
            description: lines.join('\n'),
            footer: { text: t('integration.count', { count: guildSubs.length }) }
        }],
        flags: MessageFlags.Ephemeral
    });
}