import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
    name: 'Translate',
    type: 3,
    category: 'Utility',

    async execute(interaction) {try {
try {

        const translationService = global.translationService;
        if (!translationService) {
            await interaction.reply({
                content: 'Translation service is not available.',
                flags: 64
            });
            return;
        }

        const messageToTranslate = interaction.targetMessage;
        const textToTranslate = messageToTranslate.content;

        if (!textToTranslate || textToTranslate.trim().length === 0) {
            await interaction.reply({
                content: 'That message doesn\'t have any text to translate.',
                flags: 64
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

        modal.addComponents(new ActionRowBuilder().addComponents(languageInput));

        await interaction.showModal(modal);

        try {
            const modalSubmit = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: i => i.customId === `translate_lang_${interaction.id}`
            });

            const targetLanguage = modalSubmit.fields.getTextInputValue('target_language').trim() || 'EN';

            await modalSubmit.deferReply({ flags: 64 });

            const translation = await translationService.translate(textToTranslate, targetLanguage);

            const response = `> **${translation.sourceLangName}:**\n> ${translation.original}\n\n**${translation.targetLangName}:**\n${translation.translated}`;

            await modalSubmit.editReply({ content: response });
            console.log(`[TRANSLATE] ${interaction.user.tag} translated from ${translation.sourceLangName} to ${translation.targetLangName}`);
        } catch (error) {
            if (error.message?.includes('time') || error.code === 'InteractionCollectorError') {
                return;
            }
            console.error('[TRANSLATE] Error:', error.message);

            let errorMessage = 'Translation failed. Please try again.';
            if (error.message.includes('Unsupported language')) {
                const langs = global.translationService?.getAvailableLanguagesString();
                errorMessage = `Language not supported. Available: ${langs || 'see translation service docs'}`;
            } else if (error.message.includes('Too many')) {
                errorMessage = 'Too many translation requests. Please wait a moment.';
            }

            await interaction.followUp({ content: errorMessage, flags: 64 });
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};
