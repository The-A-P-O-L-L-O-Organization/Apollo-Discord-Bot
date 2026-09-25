import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    data: new SlashCommandBuilder()
        .setName('operator-contact')
        .setDescription('View the contact information for this bot instance\'s operator')
        .setDMPermission(true),
    name: 'operator-contact',
    description: 'View the contact information for this bot instance\'s operator',
    category: 'Utility',
    dmPermission: true,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const operator = config.operator;

            if (operator?.agreed !== true || !operator.contact || operator.contact.trim().length === 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(t('operatorcontact.missingTitle'))
                    .setDescription(t('operatorcontact.missingDesc'))
                    .setTimestamp();

                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(t('operatorcontact.title'))
                .setDescription(t('operatorcontact.desc'))
                .addFields(
                    { name: t('operatorcontact.contact'), value: operator.contact, inline: false }
                )
                .setFooter({ text: t('operatorcontact.footer') })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

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