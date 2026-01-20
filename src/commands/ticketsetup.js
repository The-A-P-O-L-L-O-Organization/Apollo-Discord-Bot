// Ticket Setup Command
// Allows admins to configure the ticket system

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/dataStore.js';
import { config } from '../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticketsetup')
        .setDescription('Configure the ticket system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Create a ticket panel with a button for users to open tickets')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to send the ticket panel to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('title')
                        .setDescription('Title for the ticket panel embed')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description for the ticket panel embed')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('category')
                .setDescription('Set the category where ticket channels will be created')
                .addChannelOption(option =>
                    option
                        .setName('category')
                        .setDescription('The category for ticket channels')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('supportrole')
                .setDescription('Set the support role that can see all tickets')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The support role')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current ticket system configuration')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'admin',

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'panel') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'Support Tickets';
            const description = interaction.options.getString('description') || 
                'Click the button below to create a support ticket.\n\nA staff member will assist you shortly.';

            // Create the embed
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'Click the button below to open a ticket' })
                .setTimestamp();

            // Create the button
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setLabel('Create Ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📩')
                );

            // Send the panel
            try {
                const panelMessage = await channel.send({ 
                    embeds: [embed], 
                    components: [row] 
                });

                // Save the panel message ID for reference
                const ticketConfig = getGuildData('tickets', guildId);
                ticketConfig.panelMessageId = panelMessage.id;
                ticketConfig.panelChannelId = channel.id;
                setGuildData('tickets', guildId, ticketConfig);

                return interaction.reply({
                    content: `Ticket panel created in ${channel}!`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('[ERROR] Failed to create ticket panel:', error);
                return interaction.reply({
                    content: 'Failed to create the ticket panel. Make sure I have permission to send messages in that channel.',
                    ephemeral: true
                });
            }

        } else if (subcommand === 'category') {
            const category = interaction.options.getChannel('category');

            const ticketConfig = getGuildData('tickets', guildId);
            ticketConfig.categoryId = category.id;
            setGuildData('tickets', guildId, ticketConfig);

            return interaction.reply({
                content: `Ticket category set to **${category.name}**. New tickets will be created in this category.`,
                ephemeral: true
            });

        } else if (subcommand === 'supportrole') {
            const role = interaction.options.getRole('role');

            const ticketConfig = getGuildData('tickets', guildId);
            ticketConfig.supportRoleId = role.id;
            setGuildData('tickets', guildId, ticketConfig);

            return interaction.reply({
                content: `Support role set to ${role}. Members with this role can see all tickets.`,
                ephemeral: true
            });

        } else if (subcommand === 'status') {
            const ticketConfig = getGuildData('tickets', guildId);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Ticket System Configuration')
                .setTimestamp();

            // Category
            let categoryStatus = 'Not configured';
            if (ticketConfig.categoryId) {
                try {
                    const category = await interaction.guild.channels.fetch(ticketConfig.categoryId);
                    if (category) {
                        categoryStatus = category.name;
                    }
                } catch {
                    categoryStatus = 'Category not found (needs reconfiguration)';
                }
            }

            // Support role
            let roleStatus = 'Not configured';
            if (ticketConfig.supportRoleId) {
                try {
                    const role = await interaction.guild.roles.fetch(ticketConfig.supportRoleId);
                    if (role) {
                        roleStatus = role.name;
                    }
                } catch {
                    roleStatus = 'Role not found (needs reconfiguration)';
                }
            }

            // Panel
            let panelStatus = 'Not created';
            if (ticketConfig.panelMessageId && ticketConfig.panelChannelId) {
                panelStatus = `[Jump to panel](https://discord.com/channels/${guildId}/${ticketConfig.panelChannelId}/${ticketConfig.panelMessageId})`;
            }

            embed.addFields(
                { name: 'Ticket Category', value: categoryStatus, inline: true },
                { name: 'Support Role', value: roleStatus, inline: true },
                { name: 'Ticket Panel', value: panelStatus, inline: false }
            );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
