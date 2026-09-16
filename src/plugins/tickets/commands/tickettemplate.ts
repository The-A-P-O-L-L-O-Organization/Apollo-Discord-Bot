import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData, generateId } from '../../../utils/db.js';
// @ts-expect-error - discordErrors not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface TemplateData {
    id: string;
    name: string;
    category: string;
    autoResponse: string;
    questions: string[];
    createdBy: string;
    createdAt: number;
}

export default {
    name: 'tickettemplate',
    data: new SlashCommandBuilder()
        .setName('tickettemplate')
        .setDescription('Manage ticket templates')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Template name')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category for this template')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Technical Support', value: 'technical' },
                            { name: 'Billing', value: 'billing' },
                            { name: 'General', value: 'general' },
                            { name: 'Report', value: 'report' },
                            { name: 'Other', value: 'other' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('response')
                        .setDescription('Auto-response message for this template')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('questions')
                        .setDescription('Questions to ask (separate with | character)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a ticket template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Template name to delete')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all ticket templates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View a specific template')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Template name to view')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),
    category: 'admin',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild!.id;

            if (subcommand === 'create') {
                const name = interaction.options.getString('name')!;
                const category = interaction.options.getString('category')!;
                const response = interaction.options.getString('response')!;
                const questionsStr = interaction.options.getString('questions');

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                if (list.find(t => t.name.toLowerCase() === name.toLowerCase())) {
                    return interaction.reply({
                        content: `A template named **${name}** already exists. Delete it first to create a new one with this name.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const questions = questionsStr ? questionsStr.split('|').map(q => q.trim()).filter(q => q.length > 0) : [];

                const template: TemplateData = {
                    id: generateId(),
                    name,
                    category,
                    autoResponse: response,
                    questions,
                    createdBy: interaction.user.id,
                    createdAt: Date.now()
                };

                await updateGuildData('ticket-templates', guildId, (data: Record<string, unknown>) => {
                    const currentList = (data['list'] as TemplateData[]) || [];
                    currentList.push(template);
                    data['list'] = currentList;
                    return data;
                });

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('Template Created')
                    .setDescription(`Template **${name}** has been created successfully.`)
                    .addFields(
                        { name: 'Category', value: category, inline: true },
                        { name: 'Questions', value: questions.length > 0 ? questions.join('\n') : 'None', inline: false },
                        { name: 'Auto-Response', value: response.substring(0, 1024), inline: false }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (subcommand === 'delete') {
                const name = interaction.options.getString('name')!;

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                const templateIndex = list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());

                if (templateIndex === -1) {
                    return interaction.reply({
                        content: `Template **${name}** not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const deletedTemplate = list[templateIndex];
                await updateGuildData('ticket-templates', guildId, (data: Record<string, unknown>) => {
                    const currentList = (data['list'] as TemplateData[]) || [];
                    data['list'] = currentList.filter(t => t.id !== deletedTemplate.id);
                    return data;
                });

                return interaction.reply({
                    content: `Template **${deletedTemplate.name}** has been deleted.`,
                    flags: MessageFlags.Ephemeral
                });

            } else if (subcommand === 'list') {
                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                if (list.length === 0) {
                    return interaction.reply({
                        content: 'No templates have been created yet. Use `/tickettemplate create` to create one.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Ticket Templates')
                    .setDescription(`Total templates: ${list.length}`)
                    .setTimestamp();

                list.forEach(template => {
                    embed.addFields({
                        name: `${template.name} (${template.category})`,
                        value: `Questions: ${template.questions.length || 0}\nCreated: <t:${Math.floor(template.createdAt / 1000)}:R>`,
                        inline: false
                    });
                });

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (subcommand === 'view') {
                const name = interaction.options.getString('name')!;

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                const template = list.find(t => t.name.toLowerCase() === name.toLowerCase());

                if (!template) {
                    return interaction.reply({
                        content: `Template **${name}** not found.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(`Template: ${template.name}`)
                    .addFields(
                        { name: 'Category', value: template.category, inline: true },
                        { name: 'Created', value: `<t:${Math.floor(template.createdAt / 1000)}:R>`, inline: true },
                        { name: 'Questions', value: template.questions.length > 0 ? template.questions.join('\n') : 'None', inline: false },
                        { name: 'Auto-Response', value: template.autoResponse, inline: false }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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