import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';

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

            if (subcommand === 'panel') {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                const channel = interaction.options.getChannel('channel')! as TextChannel;
                const title = interaction.options.getString('title') ?? t('ticketsetup.panelDefaultTitle');
                const description = interaction.options.getString('description') ??
                t('ticketsetup.panelDefaultDescription');

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(title)
                    .setDescription(description)
                    .setFooter({ text: t('ticketsetup.panelFooter') })
                    .setTimestamp();

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('create_ticket')
                            .setLabel(t('ticketsetup.panelButtonCreate'))
                            .setStyle(ButtonStyle.Primary)
                    );

                try {
                    const panelMessage = await channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                    await updateGuildData('tickets', guildId, (data) => {
                        data['panelMessageId'] = panelMessage.id;
                        data['panelChannelId'] = channel.id;
                        return data;
                    });

                    await interaction.reply({
                        content: t('ticketsetup.panelCreated', { channel: channel.id }),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                } catch (error) {
                    logger.error({ err: error, msg: '[ERROR] Failed to create ticket panel:' });
                    await interaction.reply({
                        content: t('ticketsetup.panelFailed'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

            } else if (subcommand === 'category') {
                const category = interaction.options.getChannel('category')!;

                await updateGuildData('tickets', guildId, (data) => {
                    data['categoryId'] = category.id;
                    return data;
                });

                await interaction.reply({
                    content: t('ticketsetup.categorySet', { name: category.name }),
                    flags: MessageFlags.Ephemeral
                });
                return;

            } else if (subcommand === 'supportrole') {
                const role = interaction.options.getRole('role')!;

                await updateGuildData('tickets', guildId, (data) => {
                    data['supportRoleId'] = role.id;
                    return data;
                });

                await interaction.reply({
                    content: t('ticketsetup.supportRoleSet', { role: role.id }),
                    flags: MessageFlags.Ephemeral
                });
                return;

            } else if (subcommand === 'status') {
                const ticketConfig = await getGuildData('tickets', guildId);

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('ticketsetup.statusTitle'))
                    .setTimestamp();

                let categoryStatus = t('ticketsetup.notConfigured');
                if (ticketConfig['categoryId']) {
                    try {
                        const category = await interaction.guild!.channels.fetch(ticketConfig['categoryId'] as string);
                        if (category) {
                            categoryStatus = category.name;
                        }
                    } catch {
                        categoryStatus = t('ticketsetup.categoryMissing');
                    }
                }

                let roleStatus = t('ticketsetup.notConfigured');
                if (ticketConfig['supportRoleId']) {
                    try {
                        const role = await interaction.guild!.roles.fetch(ticketConfig['supportRoleId'] as string);
                        if (role) {
                            roleStatus = role.name;
                        }
                    } catch {
                        roleStatus = t('ticketsetup.roleMissing');
                    }
                }

                let panelStatus = t('ticketsetup.panelMissing');
                if (ticketConfig['panelMessageId'] && ticketConfig['panelChannelId']) {
                    panelStatus = `[Jump to panel](https://discord.com/channels/${guildId}/${ticketConfig['panelChannelId'] as string}/${ticketConfig['panelMessageId'] as string})`;
                }

                embed.addFields(
                    { name: t('ticketsetup.fieldCategory'), value: categoryStatus, inline: true },
                    { name: t('ticketsetup.fieldSupportRole'), value: roleStatus, inline: true },
                    { name: t('ticketsetup.fieldPanel'), value: panelStatus, inline: false }
                );

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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