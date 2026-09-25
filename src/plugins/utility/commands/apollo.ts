import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

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
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'info') {
                return handleInfo(interaction);
            } else if (subcommand === 'docs') {
                return handleDocs(interaction);
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

async function handleInfo(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const infoEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(t('apollo.infoTitle'))
        .setDescription(t('apollo.infoDesc'))
        .addFields(
            {
                name: t('apollo.purpose'),
                value: t('apollo.purposeValue'),
                inline: false
            },
            {
                name: t('apollo.links'),
                value: '[GitHub Organization](https://github.com/The-A-P-O-L-L-O-Organization)\n[Documentation](https://the-a-p-o-l-l-o-organization.github.io/Apollo-Org-Docs/)',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({
            text: t('apollo.requestedBy', { user: interaction.user.tag }),
            iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 })
        });

    await interaction.reply({ embeds: [infoEmbed] });
}

async function handleDocs(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const docsEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(t('apollo.docsTitle'))
        .setDescription(t('apollo.docsDesc'))
        .setTimestamp()
        .setFooter({
            text: t('apollo.requestedBy', { user: interaction.user.tag }),
            iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 })
        });

    await interaction.reply({ embeds: [docsEmbed] });
}