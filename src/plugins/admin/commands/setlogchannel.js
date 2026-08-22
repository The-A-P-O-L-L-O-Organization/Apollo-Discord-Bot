import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { setGuildData, getGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    name: 'setlogchannel',
    canQueue: false,
    data: new SlashCommandBuilder()
        .setName('setlogchannel')
        .setDescription('Set the channel for server event logs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the logging channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to send logs to')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove the logging channel (disables logging)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View the current logging channel')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    category: 'admin',

    async execute(interaction) {
        try {
            try {
                const subcommand = interaction.options.getSubcommand();
                const guildId = interaction.guild.id;

                if (subcommand === 'set') {
                const channel = interaction.options.getChannel('channel');

                const botMember = interaction.guild.members.me;
                const permissions = channel.permissionsFor(botMember);

                if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                    return interaction.reply({
                        content: `I don't have permission to send messages or embeds in ${channel}. Please grant me the required permissions.`,
                        flags: 64
                    });
                }

                const existingConfig = await getGuildData('logging', guildId);
                const newConfig = {
                    ...existingConfig,
                    channelId: channel.id
                };

                await setGuildData('logging', guildId, newConfig);

                return interaction.reply({
                    content: `Logging channel has been set to ${channel}.\n\nUse \`/logging\` to configure which events are logged.`,
                    flags: 64
                });

            } else if (subcommand === 'remove') {
                const existingConfig = await getGuildData('logging', guildId);
                
                if (!existingConfig.channelId) {
                    return interaction.reply({
                        content: 'No logging channel is currently set.',
                        flags: 64
                    });
                }

                const newConfig = {
                    ...existingConfig,
                    channelId: null
                };

                await setGuildData('logging', guildId, newConfig);

                return interaction.reply({
                    content: 'Logging channel has been removed. Server event logging is now disabled.',
                    flags: 64
                });

            } else if (subcommand === 'view') {
                const config = await getGuildData('logging', guildId);

                if (!config.channelId) {
                    return interaction.reply({
                        content: 'No logging channel is currently set.\n\nUse `/setlogchannel set` to configure one.',
                        flags: 64
                    });
                }

                try {
                    const channel = await interaction.guild.channels.fetch(config.channelId);
                    if (channel) {
                        return interaction.reply({
                            content: `Current logging channel: ${channel}\n\nUse \`/logging status\` to see which events are being logged.`,
                            flags: 64
                        });
                    }
                } catch (error) {
                }

                return interaction.reply({
                    content: 'The configured logging channel no longer exists. Please set a new one with `/setlogchannel set`.',
                    flags: 64
                });
            }
        } catch (error) {
            const userMessage = handleDiscordError(error);
            if (userMessage) {
                await safeReply(interaction, userMessage);
            }
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
