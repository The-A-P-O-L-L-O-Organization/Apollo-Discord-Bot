// Automod Command
// Configure automatic moderation settings per server
import type { ChatInputCommandInteraction } from 'discord.js';
import { PermissionsBitField, ChannelType, SlashCommandBuilder } from 'discord.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';
import { handleEnable } from './automod/enable.js';
import { handleDisable } from './automod/disable.js';
import { handleStatus } from './automod/status.js';
import { handleAddWord } from './automod/addword.js';
import { handleRemoveWord } from './automod/removeword.js';
import { handleListWords } from './automod/listwords.js';
import { handleSet } from './automod/set.js';
import { handleExemptChannel } from './automod/exemptchannel.js';
import { handleExemptRole } from './automod/exemptrole.js';
import { handleScan } from './automod/scan.js';

export default {
    name: 'automod',
    description: 'Configure automatic moderation',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        { name: 'enable', description: 'Enable automod for this server', type: 1 },
        { name: 'disable', description: 'Disable automod for this server', type: 1 },
        { name: 'status', description: 'View current automod configuration', type: 1 },
        { name: 'addword', description: 'Add a word to the banned words list', type: 1, options: [{ name: 'word', description: 'The word to ban', type: 3, required: true }] },
        { name: 'removeword', description: 'Remove a word from the banned words list', type: 1, options: [{ name: 'word', description: 'The word to remove', type: 3, required: true }] },
        { name: 'listwords', description: 'List all banned words', type: 1 },
        { name: 'set', description: 'Configure an automod setting', type: 1, options: [
            { name: 'setting', description: 'The setting to configure', type: 3, required: true, choices: [
                { name: 'Filter Invites', value: 'filterInvites' },
                { name: 'Filter Links', value: 'filterLinks' },
                { name: 'Filter Phishing Links', value: 'filterPhishingLinks' },
                { name: 'Raid Detection', value: 'raidDetection' },
                { name: 'Max Mentions', value: 'maxMentions' },
                { name: 'Max Caps Percent', value: 'maxCapsPercent' },
                { name: 'Min Account Age (days)', value: 'minAccountAge' },
                { name: 'Spam Threshold', value: 'spamThreshold' },
                { name: 'Spam Interval (ms)', value: 'spamInterval' },
                { name: 'AI Moderation', value: 'aiModeration' },
                { name: 'NSFW Filter', value: 'nsfwFilter' }
            ]},
            { name: 'value', description: 'The value to set (true/false for toggles, number for limits)', type: 3, required: true }
        ]},
        { name: 'exemptchannel', description: 'Add/remove a channel from automod exemptions', type: 1, options: [
            { name: 'channel', description: 'The channel to exempt', type: 7, required: true, channel_types: [ChannelType.GuildText] },
            { name: 'action', description: 'Add or remove exemption', type: 3, required: true, choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }] }
        ]},
        { name: 'exemptrole', description: 'Add/remove a role from automod exemptions', type: 1, options: [
            { name: 'role', description: 'The role to exempt', type: 8, required: true },
            { name: 'action', description: 'Add or remove exemption', type: 3, required: true, choices: [{ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }] }
        ]},
        { name: 'scan', description: 'Scan messages for NSFW content', type: 1, options: [
            { name: 'channel', description: 'Channel to scan', type: 7, required: true, channel_types: [ChannelType.GuildText] },
            { name: 'limit', description: 'Number of messages to scan (1-1000)', type: 4, required: false, min_value: 1, max_value: 1000 },
            { name: 'user', description: 'User to filter by (optional)', type: 6, required: false },
            { name: 'delete', description: 'Delete detected NSFW messages', type: 5, required: false }
        ]}
    ],
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure automatic moderation')
        .setDescriptionLocalizations({
            'es-ES': 'Configura la moderación automática',
            de: 'Konfiguriere automatische Moderation'
        })
        .addSubcommand(sub => sub
            .setName('enable')
            .setDescription('Enable automod for this server')
        )
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable automod for this server')
        )
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View current automod configuration')
        )
        .addSubcommand(sub => sub
            .setName('addword')
            .setDescription('Add a word to the banned words list')
            .addStringOption(opt => opt
                .setName('word')
                .setDescription('The word to ban')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('removeword')
            .setDescription('Remove a word from the banned words list')
            .addStringOption(opt => opt
                .setName('word')
                .setDescription('The word to remove')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('listwords')
            .setDescription('List all banned words')
        )
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Configure an automod setting')
            .addStringOption(opt => opt
                .setName('setting')
                .setDescription('The setting to configure')
                .setRequired(true)
                .addChoices(
                    { name: 'Filter Invites', value: 'filterInvites' },
                    { name: 'Filter Links', value: 'filterLinks' },
                    { name: 'Filter Phishing Links', value: 'filterPhishingLinks' },
                    { name: 'Raid Detection', value: 'raidDetection' },
                    { name: 'Max Mentions', value: 'maxMentions' },
                    { name: 'Max Caps Percent', value: 'maxCapsPercent' },
                    { name: 'Min Account Age (days)', value: 'minAccountAge' },
                    { name: 'Spam Threshold', value: 'spamThreshold' },
                    { name: 'Spam Interval (ms)', value: 'spamInterval' },
                    { name: 'AI Moderation', value: 'aiModeration' },
                    { name: 'NSFW Filter', value: 'nsfwFilter' }
                )
            )
            .addStringOption(opt => opt
                .setName('value')
                .setDescription('The value to set (true/false for toggles, number for limits)')
                .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('exemptchannel')
            .setDescription('Add/remove a channel from automod exemptions')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('The channel to exempt')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Add or remove exemption')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('exemptrole')
            .setDescription('Add/remove a role from automod exemptions')
            .addRoleOption(opt => opt
                .setName('role')
                .setDescription('The role to exempt')
                .setRequired(true)
            )
            .addStringOption(opt => opt
                .setName('action')
                .setDescription('Add or remove exemption')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                )
            )
        )
        .addSubcommand(sub => sub
            .setName('scan')
            .setDescription('Scan messages for NSFW content')
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel to scan')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
            .addIntegerOption(opt => opt
                .setName('limit')
                .setDescription('Number of messages to scan (1-1000)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1000)
            )
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to filter by (optional)')
                .setRequired(false)
            )
            .addBooleanOption(opt => opt
                .setName('delete')
                .setDescription('Delete detected NSFW messages')
                .setRequired(false)
            )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
            case 'enable':
                await handleEnable(interaction);
                break;
            case 'disable':
                await handleDisable(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'addword':
                await handleAddWord(interaction);
                break;
            case 'removeword':
                await handleRemoveWord(interaction);
                break;
            case 'listwords':
                await handleListWords(interaction);
                break;
            case 'set':
                await handleSet(interaction);
                break;
            case 'exemptchannel':
                await handleExemptChannel(interaction);
                break;
            case 'exemptrole':
                await handleExemptRole(interaction);
                break;
            case 'scan':
                await handleScan(interaction);
                break;
            }
        } catch (error) {
            const userMessage = await handleDiscordError(error);
            if (userMessage) {
                await safeReply(interaction, userMessage);
            }
        }
    }
};
