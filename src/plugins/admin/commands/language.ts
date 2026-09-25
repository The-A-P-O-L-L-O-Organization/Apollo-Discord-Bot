import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { logLocaleChange } from '../../../utils/modLog.js';
import { i18n, isSupported } from '../../../i18n/index.js';
import { localeCache, getBoundEventBus } from '../../../i18n/localeCache.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    name: 'language',
    canQueue: false,
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Set the server language')
        .addStringOption(option =>
            option
                .setName('locale')
                .setDescription('BCP47 locale code (e.g. en-US, es-ES, de)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'admin',

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            try {
                const guildId = interaction.guildId ?? interaction.guild?.id;
                if (typeof guildId !== 'string' || guildId.length === 0) {
                    return interaction.reply({
                        content: i18n.tFor(interaction, 'admin:language.guildOnly'),
                        flags: MessageFlags.Ephemeral
                    });
                }
                const raw = interaction.options.getString('locale');
                if (!isSupported(raw)) {
                    return interaction.reply({
                        content: i18n.tFor(interaction, 'admin:language.unsupported', { vars: { locale: raw ?? '' } }),
                        flags: MessageFlags.Ephemeral
                    });
                }
                const settings = await getGuildData('settings', guildId);
                const stored = settings['locale'];
                const oldLocale = typeof stored === 'string' && isSupported(stored) ? stored : 'en-US';
                await updateGuildData('settings', guildId, (current) => ({ ...current, locale: raw }));
                localeCache.delete(guildId);
                const bus = (interaction.client as unknown as { bus?: { emit: (event: string, payload: unknown) => Promise<void> } }).bus ?? getBoundEventBus();
                await bus?.emit('i18n:localeChanged', { guildId, locale: raw });
                logLocaleChange({ guildId, actor: { id: interaction.user.id, tag: interaction.user.tag }, oldLocale, newLocale: raw });
                return interaction.reply({
                    content: i18n.tFor(interaction, 'admin:language.updated', { vars: { locale: raw } }),
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                const userMessage = handleDiscordError(error);
                if (userMessage) {
                    await safeReply(interaction, userMessage);
                }
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};
