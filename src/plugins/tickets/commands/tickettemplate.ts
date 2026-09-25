import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData, generateId } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'tickets');

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild!.id;

            if (subcommand === 'create') {
                const name = interaction.options.getString('name')!;
                const category = interaction.options.getString('category')!;
                const response = interaction.options.getString('response')!;
                const questionsStr = interaction.options.getString('questions');

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                if (list.find(tmpl => tmpl.name.toLowerCase() === name.toLowerCase())) {
                    await interaction.reply({
                        content: t('tickettemplate.alreadyExists', { name }),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
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
                    .setTitle(t('tickettemplate.createdTitle'))
                    .setDescription(t('tickettemplate.createdDescription', { name }))
                    .addFields(
                        { name: t('tickettemplate.fieldCategory'), value: category, inline: true },
                        { name: t('tickettemplate.fieldQuestions'), value: questions.length > 0 ? questions.join('\n') : t('tickettemplate.fieldNone'), inline: false },
                        { name: t('tickettemplate.fieldAutoResponse'), value: response.substring(0, 1024), inline: false }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;

            } else if (subcommand === 'delete') {
                const name = interaction.options.getString('name')!;

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                const templateIndex = list.findIndex(tmpl => tmpl.name.toLowerCase() === name.toLowerCase());

                if (templateIndex === -1) {
                    await interaction.reply({
                        content: t('tickettemplate.notFound', { name }),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const deletedTemplate = list[templateIndex]!;
                await updateGuildData('ticket-templates', guildId, (data: Record<string, unknown>) => {
                    const currentList = (data['list'] as TemplateData[]) || [];
                    data['list'] = currentList.filter(t => t.id !== deletedTemplate.id);
                    return data;
                });

                await interaction.reply({
                    content: t('tickettemplate.deleted', { name: deletedTemplate.name }),
                    flags: MessageFlags.Ephemeral
                });
                return;

            } else if (subcommand === 'list') {
                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                if (list.length === 0) {
                    await interaction.reply({
                        content: t('tickettemplate.empty'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('tickettemplate.listTitle'))
                    .setDescription(t('tickettemplate.listDescription', { count: list.length }))
                    .setTimestamp();

                list.forEach(template => {
                    embed.addFields({
                        name: `${template.name} (${template.category})`,
                        value: t('tickettemplate.listRow', { count: template.questions.length || 0, timestamp: Math.floor(template.createdAt / 1000) }),
                        inline: false
                    });
                });

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;

            } else if (subcommand === 'view') {
                const name = interaction.options.getString('name')!;

                const templates = await getGuildData('ticket-templates', guildId);
                const list = (templates['list'] as TemplateData[]) || [];

                const template = list.find(t => t.name.toLowerCase() === name.toLowerCase());

                if (!template) {
                    await interaction.reply({
                        content: t('tickettemplate.notFound', { name }),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('tickettemplate.viewTitle', { name: template.name }))
                    .addFields(
                        { name: t('tickettemplate.fieldCategory'), value: template.category, inline: true },
                        { name: t('tickettemplate.fieldCreated'), value: `<t:${Math.floor(template.createdAt / 1000)}:R>`, inline: true },
                        { name: t('tickettemplate.fieldQuestions'), value: template.questions.length > 0 ? template.questions.join('\n') : t('tickettemplate.fieldNone'), inline: false },
                        { name: t('tickettemplate.fieldAutoResponse'), value: template.autoResponse, inline: false }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
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