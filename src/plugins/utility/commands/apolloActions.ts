import type { UserContextMenuCommandInteraction} from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';
import { getData, updateGuildData } from '../../../utils/db.js';
import { isOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
import { logger } from '../../../utils/logger.js';

interface GlobalBlacklistData {
    entries: Record<string, {
        userId: string;
        userTag: string;
        reason: string;
        moderatorId: string;
        moderatorTag: string;
        addedAt: number;
    }>;
}

export default {
    data: new ContextMenuCommandBuilder()
        .setName('Global Ban')
        .setType(ApplicationCommandType.User)
        .setDMPermission(true),
    name: 'Global Ban',
    type: 2,
    canQueue: false,

    async execute(interaction: UserContextMenuCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            if (!isOwner(interaction.user.id)) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('apolloActions.deniedTitle'),
                        description: t('apolloActions.deniedDesc')
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const targetUser = interaction.targetUser;

            if (targetUser.id === interaction.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('apolloActions.selfTitle'),
                        description: t('apolloActions.selfDesc')
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (targetUser.id === interaction.client.user.id) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('apolloActions.botTitle'),
                        description: t('apolloActions.botDesc')
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`apollo_gban_${interaction.id}`)
                .setTitle(t('apolloActions.modalTitle'));

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel(t('apolloActions.reasonLabel'))
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(t('apolloActions.reasonPlaceholder'))
                .setMaxLength(1000)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));

            await interaction.showModal(modal);

            const modalSubmit = await interaction.awaitModalSubmit({
                time: 120_000,
                filter: (i) => i.customId === `apollo_gban_${interaction.id}`
            });

            const reason = modalSubmit.fields.getTextInputValue('reason').trim();

            const globalData = ((await getData('global_blacklist')) as unknown as GlobalBlacklistData | undefined) ?? { entries: {} };
            const entries = globalData.entries ?? {};

            const existing = entries[targetUser.id];
            if (existing) {
                await modalSubmit.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: t('apolloActions.alreadyTitle'),
                        description: t('apolloActions.alreadyDesc', { user: targetUser.tag, reason: existing.reason })
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('global_blacklist', '__global__', (data: Record<string, unknown>) => {
                data['entries'] ??= {};
                (data['entries'] as Record<string, unknown>)[targetUser.id] = {
                    userId: targetUser.id,
                    userTag: targetUser.tag,
                    reason: reason,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    addedAt: Date.now()
                };
                return data;
            });

            await modalSubmit.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('apolloActions.doneTitle'),
                    description: t('apolloActions.doneDesc', { user: targetUser.tag }),
                    fields: [
                        { name: t('apolloActions.user'), value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
                        { name: t('apolloActions.moderator'), value: interaction.user.tag, inline: true },
                        { name: t('apolloActions.reason'), value: reason, inline: false }
                    ],
                    thumbnail: { url: targetUser.displayAvatarURL({ extension: 'png', size: 256 }) },
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });

            logger.info({ msg: `[GLOBAL BAN] User ${targetUser.tag} globally blacklisted by ${interaction.user.tag}. Reason: ${reason}` });
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