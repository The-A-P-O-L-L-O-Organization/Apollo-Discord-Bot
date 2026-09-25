// Strikes Command - View a user's strike history
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

import type { StrikeEntry } from './strike.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'strikes',
    description: 'View a user\'s strike history',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to check strikes for',
            type: 6,
            required: true
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');

            if (!user) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('strikes.missingUserTitle'),
                        description: t('strikes.missingUserDescription'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const strikes = ((await getUserData('strikes', interaction.guild!.id, user.id)) as unknown as StrikeEntry[]) ?? [];
            const activeStrikes = strikes.filter(s => s.active !== false);

            if (strikes.length === 0) {
                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: t('strikes.infoNoStrikes'),
                        description: t('strikes.userHasNoStrikesOn', { user: user.tag }),
                        timestamp: new Date().toISOString()
                    }]
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(t('strikes.strikeHistoryUser', { user: user.tag }))
                .setDescription(t('strikes.totalCountStrikeSActive', { count: strikes.length, count2: activeStrikes.length }))
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            strikes.slice(0, 25).forEach((strike, index) => {
                const date = new Date(strike.timestamp).toLocaleString();
                const status = strike.active === false ? '(Removed)' : '';

                embed.addFields({
                    name: t('strikes.strikeValueStatus', { value: index + 1, status: status }),
                    value: t('strikes.idValueNReasonReason', { value: strike.id, reason: strike.reason, moderator: strike.moderatorTag, date: date }),
                    inline: false
                });
            });

            if (strikes.length > 25) {
                embed.setFooter({ text: t('strikes.showingOfCountStrikes', { count: strikes.length }) });
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('strikes.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};