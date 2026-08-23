import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'ticketsetup',
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
        try {
            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (subcommand === 'panel') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || 'Support Tickets';
                const description = interaction.options.getString('description') ||
                'Click the button below to create a support ticket.\n\nA staff member will assist you shortly.';

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(title)
                    .setDescription(description)
                    .setFooter({ text: 'Click the button below to open a ticket' })
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('create_ticket')
                            .setLabel('Create Ticket')
                            .setStyle(ButtonStyle.Primary)
                    );

                try {
                    const panelMessage = await channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                    await updateGuildData('tickets', guildId, (data) => {
                        data.panelMessageId = panelMessage.id;
                        data.panelChannelId = channel.id;
                        return data;
                    });

                    return interaction.reply({
                        content: `Ticket panel created in ${channel}!`,
                        flags: 64
                    });
                } catch (error) {
                    logger.error('[ERROR] Failed to create ticket panel:', error);
                    return interaction.reply({
                        content: 'Failed to create the ticket panel. Make sure I have permission to send messages in that channel.',
                        flags: 64
                    });
                }

            } else if (subcommand === 'category') {
                const category = interaction.options.getChannel('category');

                await updateGuildData('tickets', guildId, (data) => {
                    data.categoryId = category.id;
                    return data;
                });

                return interaction.reply({
                    content: `Ticket category set to **${category.name}**. New tickets will be created in this category.`,
                    flags: 64
                });

            } else if (subcommand === 'supportrole') {
                const role = interaction.options.getRole('role');

                await updateGuildData('tickets', guildId, (data) => {
                    data.supportRoleId = role.id;
                    return data;
                });

                return interaction.reply({
                    content: `Support role set to ${role}. Members with this role can see all tickets.`,
                    flags: 64
                });

            } else if (subcommand === 'status') {
                const ticketConfig = await getGuildData('tickets', guildId);

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Ticket System Configuration')
                    .setTimestamp();

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

                let panelStatus = 'Not created';
                if (ticketConfig.panelMessageId && ticketConfig.panelChannelId) {
                    panelStatus = `[Jump to panel](https://discord.com/channels/${guildId}/${ticketConfig.panelChannelId}/${ticketConfig.panelMessageId})`;
                }

                embed.addFields(
                    { name: 'Ticket Category', value: categoryStatus, inline: true },
                    { name: 'Support Role', value: roleStatus, inline: true },
                    { name: 'Ticket Panel', value: panelStatus, inline: false }
                );

                return interaction.reply({ embeds: [embed], flags: 64 });
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