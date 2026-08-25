import { PermissionFlagsBits } from 'discord.js';
import { getData, setData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';

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
                        { name: 'RSS', value: 'rss' },
                    ],
                },
                {
                    name: 'target',
                    description: 'Streamer name, channel ID, repo (owner/repo), or feed URL',
                    type: 3,
                    required: true,
                },
                {
                    name: 'channel',
                    description: 'Channel to post notifications',
                    type: 7,
                    required: true,
                },
            ],
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
                    required: true,
                },
            ],
        },
        {
            name: 'list',
            description: 'List all integration subscriptions in this server',
            type: 1,
        },
    ],

    async execute(interaction) {
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
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleAdd(interaction) {
    const type = interaction.options.getString('type');
    const target = interaction.options.getString('target');
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
        return interaction.reply({ content: 'Please select a text channel.', flags: MessageFlags.Ephemeral });
    }

    const data = await getData('integrations') || { nextId: 1, subscriptions: [] };

    const id = data.nextId++;
    data.subscriptions.push({
        id,
        guild_id: interaction.guildId,
        channel_id: channel.id,
        type,
        target_id: target,
        config: {},
        last_checked: null,
        created_at: new Date().toISOString(),
    });

    await setData('integrations', data);

    const typeNames = { twitch: 'Twitch', youtube: 'YouTube', github: 'GitHub', rss: 'RSS' };

    await interaction.reply({
        content: `✅ Added **${typeNames[type] || type}** subscription for \`${target}\` → ${channel}. ID: \`${id}\``,
        flags: MessageFlags.Ephemeral,
    });
}

async function handleRemove(interaction) {
    const id = interaction.options.getInteger('id');
    const data = await getData('integrations') || { nextId: 1, subscriptions: [] };

    const idx = data.subscriptions.findIndex(
        s => s.id === id && s.guild_id === interaction.guildId
    );

    if (idx === -1) {
        return interaction.reply({ content: `❌ Subscription \`${id}\` not found.`, flags: MessageFlags.Ephemeral });
    }

    data.subscriptions.splice(idx, 1);
    await setData('integrations', data);

    await interaction.reply({ content: `✅ Removed subscription \`${id}\`.`, flags: MessageFlags.Ephemeral });
}

async function handleList(interaction) {
    const data = await getData('integrations') || { nextId: 1, subscriptions: [] };

    const guildSubs = data.subscriptions.filter(s => s.guild_id === interaction.guildId);

    if (guildSubs.length === 0) {
        return interaction.reply({ content: 'No integrations configured.', flags: MessageFlags.Ephemeral });
    }

    const lines = guildSubs.map(s =>
        `\`${s.id}\` | **${s.type}** | \`${s.target_id}\` | <#${s.channel_id}>`
    );

    await interaction.reply({
        embeds: [{
            color: 0x5865F2,
            title: 'Integration Subscriptions',
            description: lines.join('\n'),
            footer: { text: `${guildSubs.length} subscription(s)` },
        }],
        flags: MessageFlags.Ephemeral,
    });
}
