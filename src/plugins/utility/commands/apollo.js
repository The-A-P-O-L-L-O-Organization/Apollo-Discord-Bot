// Apollo Organization Command
// Displays information about The A.P.O.L.L.O Organization and documentation links

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
    name: 'apollo',
    data: new SlashCommandBuilder()
        .setName('apollo')
        .setDescription('Get information about The A.P.O.L.L.O Organization')
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Display information about The A.P.O.L.L.O Organization')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('docs')
                .setDescription('Get the link to Apollo Organization documentation')
        ),
    category: 'utility',

    async execute(interaction) {
    try {

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'info') {
            return handleInfo(interaction);
        } else if (subcommand === 'docs') {
            return handleDocs(interaction);
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

async function handleInfo(interaction) {
    const infoEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('The A.P.O.L.L.O Organization')
        .setDescription('An open-source organization dedicated to building innovative, modular, and scalable Discord bots and tools.')
        .addFields(
            {
                name: 'Purpose',
                value: 'Providing high-quality, community-driven solutions for Discord server management and automation.',
                inline: false
            },
            {
                name: 'Links',
                value: '[GitHub Organization](https://github.com/The-A-P-O-L-L-O-Organization)\n[Documentation](https://the-a-p-o-l-l-o-organization.github.io/Apollo-Org-Docs/)',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({
            text: `Requested by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        });

    return interaction.reply({ embeds: [infoEmbed] });
}

async function handleDocs(interaction) {
    const docsEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Apollo Organization Documentation')
        .setDescription('My documentation can be found [here](https://the-a-p-o-l-l-o-organization.github.io/Apollo-Org-Docs/)')
        .setTimestamp()
        .setFooter({
            text: `Requested by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL()
        });

    return interaction.reply({ embeds: [docsEmbed] });
}
