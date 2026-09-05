import { MessageContextMenuCommandInteraction, ModalSubmitInteraction, MessageFlags } from 'discord.js';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    // Translate Message Context Menu Command
    name: 'Translate',
    type: 3, // MESSAGE type
    category: 'utility',

    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        try {
            // @ts-expect-error translationService is attached to global by plugin
            const translationService = global.translationService;
            if (!translationService) {
                await interaction.reply({
                    content: 'Translation service is not available.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const messageToTranslate = interaction.targetMessage;
            const textToTranslate = messageToTranslate.content;

            if (!textToTranslate || textToTranslate.trim().length === 0) {
                await interaction.reply({
                    content: 'That message doesn\'t have any text to translate.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`translate_lang_${interaction.id}`)
                .setTitle('Translate Message');

            const languageInput = new TextInputBuilder()
                .setCustomId('target_language')
                .setLabel('Target language (leave blank for English)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Spanish, French, de, ja')
                .setMaxLength(50)
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(languageInput));

            await interaction.showModal(modal);

            try {
                const modalSubmit = await interaction.awaitModalSubmit({
                    time: 120_000,
                    filter: i => i.customId === `translate_lang_${interaction.id}`
                }) as ModalSubmitInteraction;

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

                let errorMessage = 'Translation failed. Please try again.';
                // @ts-expect-error translationService attached to global by plugin
                const translationServiceGlobal = global.translationService;
                if (error instanceof Error && error.message.includes('Unsupported language')) {
                    const langs = translationServiceGlobal?.getAvailableLanguagesString?.();
                    errorMessage = `Language not supported. Available: ${langs || 'see translation service docs'}`;
                } else if (error instanceof Error && error.message.includes('Too many')) {
                    errorMessage = 'Too many translation requests. Please wait a moment.';
                }

                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
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