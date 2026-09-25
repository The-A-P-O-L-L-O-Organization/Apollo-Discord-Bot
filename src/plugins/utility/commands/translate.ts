import type { MessageContextMenuCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Translate Message Context Menu Command
    name: 'Translate',
    type: 3, // MESSAGE type
    category: 'utility',

    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            // @ts-expect-error translationService is attached to global by plugin
            const translationService = global.translationService;
            if (!translationService) {
                await interaction.reply({
                    content: t('translate.unavailable'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const messageToTranslate = interaction.targetMessage;
            const textToTranslate = messageToTranslate.content;

            if (!textToTranslate || textToTranslate.trim().length === 0) {
                await interaction.reply({
                    content: t('translate.noText'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`translate_lang_${interaction.id}`)
                .setTitle(t('translate.modalTitle'));

            const languageInput = new TextInputBuilder()
                .setCustomId('target_language')
                .setLabel(t('translate.targetLabel'))
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(t('translate.targetPlaceholder'))
                .setMaxLength(50)
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(languageInput));

            await interaction.showModal(modal);

            try {
                const modalSubmit = await interaction.awaitModalSubmit({
                    time: 120_000,
                    filter: i => i.customId === `translate_lang_${interaction.id}`
                });

                const targetLanguage = modalSubmit.fields.getTextInputValue('target_language').trim() || 'EN';

                await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

                const translation = await translationService.translate(textToTranslate, targetLanguage);

                const response = `> **${translation.sourceLangName}:**\n> ${translation.original}\n\n**${translation.targetLangName}:**\n${translation.translated}`;

                await modalSubmit.editReply({ content: response });
                logger.info(`[TRANSLATE] ${interaction.user.tag} translated from ${translation.sourceLangName} to ${translation.targetLangName}`);
            } catch (error) {
                if (error instanceof Error && (error.message.includes('time') || error.name === 'InteractionCollectorError')) {
                    return;
                }
                logger.error({ err: error, msg: '[TRANSLATE] Error' });

                let errorMessage = t('translate.failed');
                // @ts-expect-error translationService attached to global by plugin
                const translationServiceGlobal = global.translationService;
                if (error instanceof Error && error.message.includes('Unsupported language')) {
                    const langs = translationServiceGlobal?.getAvailableLanguagesString?.();
                    errorMessage = t('translate.unsupported', { langs: langs ?? t('translate.seeDocs') });
                } else if (error instanceof Error && error.message.includes('Too many')) {
                    errorMessage = t('translate.rateLimited');
                }

                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
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