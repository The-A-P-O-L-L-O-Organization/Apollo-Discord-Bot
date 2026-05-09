import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData, generateId } from '../../../utils/db.js';

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

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'create') {
            const name = interaction.options.getString('name');
            const category = interaction.options.getString('category');
            const response = interaction.options.getString('response');
            const questionsStr = interaction.options.getString('questions');

            const templates = getGuildData('ticket-templates', guildId);
            if (!templates.list) {templates.list = [];}

            if (templates.list.find(t => t.name.toLowerCase() === name.toLowerCase())) {
                return interaction.reply({
                    content: `A template named **${name}** already exists. Delete it first to create a new one with this name.`,
                    ephemeral: true
                });
            }

            const questions = questionsStr ? questionsStr.split('|').map(q => q.trim()).filter(q => q.length > 0) : [];

            const template = {
                id: generateId(),
                name,
                category,
                autoResponse: response,
                questions,
                createdBy: interaction.user.id,
                createdAt: Date.now()
            };

            templates.list.push(template);
            setGuildData('ticket-templates', guildId, templates);

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

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'delete') {
            const name = interaction.options.getString('name');

            const templates = getGuildData('ticket-templates', guildId);
            if (!templates.list) {templates.list = [];}

            const templateIndex = templates.list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());

            if (templateIndex === -1) {
                return interaction.reply({
                    content: `Template **${name}** not found.`,
                    ephemeral: true
                });
            }

            const deletedTemplate = templates.list[templateIndex];
            templates.list.splice(templateIndex, 1);
            setGuildData('ticket-templates', guildId, templates);

            return interaction.reply({
                content: `Template **${deletedTemplate.name}** has been deleted.`,
                ephemeral: true
            });

        } else if (subcommand === 'list') {
            const templates = getGuildData('ticket-templates', guildId);
            
            if (!templates.list || templates.list.length === 0) {
                return interaction.reply({
                    content: 'No templates have been created yet. Use `/tickettemplate create` to create one.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Ticket Templates')
                .setDescription(`Total templates: ${templates.list.length}`)
                .setTimestamp();

            templates.list.forEach(template => {
                embed.addFields({
                    name: `${template.name} (${template.category})`,
                    value: `Questions: ${template.questions.length || 0}\nCreated: <t:${Math.floor(template.createdAt / 1000)}:R>`,
                    inline: false
                });
            });

            return interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'view') {
            const name = interaction.options.getString('name');

            const templates = getGuildData('ticket-templates', guildId);
            if (!templates.list) {templates.list = [];}

            const template = templates.list.find(t => t.name.toLowerCase() === name.toLowerCase());

            if (!template) {
                return interaction.reply({
                    content: `Template **${name}** not found.`,
                    ephemeral: true
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

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
