import type { ChatInputCommandInteraction, User } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getAllUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface LevelData {
    xp: number;
    level: number;
    messages: number;
}

interface UserDataEntry {
    user_id: string;
    data: LevelData;
}

export default {
    name: 'leaderboard',
    description: 'Show the top users by level or XP',
    category: 'Utility',
    dmPermission: true,
    options: [
        {
            name: 'type',
            description: 'What to rank by',
            type: 3,
            required: false,
            choices: [
                { name: 'Level', value: 'level' },
                { name: 'XP', value: 'xp' },
                { name: 'Messages', value: 'messages' }
            ]
        },
        {
            name: 'limit',
            description: 'Number of users to show (default: 10)',
            type: 4,
            required: false,
            min_value: 1,
            max_value: 25
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const type = interaction.options.getString('type') ?? 'level';
            const limit = interaction.options.getInteger('limit') ?? 10;

            const allLevelData = (await getAllUserData('levels', interaction.guild!.id)) as unknown as UserDataEntry[];

            if (allLevelData.length === 0) {
                await interaction.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: t('leaderboard.noDataTitle'),
                        description: t('leaderboard.noDataDesc'),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const sorted = allLevelData
                .filter(data => data.data && (data.data.xp || data.data.level || data.data.messages))
                .map(data => ({
                    userId: data.user_id,
                    xp: data.data.xp ?? 0,
                    level: data.data.level ?? 0,
                    messages: data.data.messages ?? 0
                }))
                .sort((a, b) => {
                    if (type === 'level') { return b.level - a.level; }
                    if (type === 'xp') { return b.xp - a.xp; }
                    if (type === 'messages') { return b.messages - a.messages; }
                    return 0;
                })
                .slice(0, limit);

            const userMap = new Map<string, User>();
            for (const entry of sorted) {
                try {
                    const user = await interaction.client.users.fetch(entry.userId);
                    userMap.set(entry.userId, user);
                } catch {
                    // User not found, skip
                }
            }

            const typeLabel = type === 'level' ? t('leaderboard.level') : type === 'xp' ? t('leaderboard.xp') : t('leaderboard.messages');
            const fields = sorted.map((entry, index) => {
                const user = userMap.get(entry.userId);
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                const value = type === 'level' ? t('leaderboard.levelValue', { level: entry.level }) :
                    type === 'xp' ? t('leaderboard.xpValue', { count: formatNumber(entry.xp) }) :
                        t('leaderboard.messagesValue', { count: formatNumber(entry.messages) });

                return {
                    name: `${medal} ${user ? user.tag : t('leaderboard.unknownUser')}`,
                    value: value,
                    inline: false
                };
            });

            const leaderboardEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(t('leaderboard.title', { label: typeLabel }))
                .setDescription(t('leaderboard.description', { count: limit, label: typeLabel.toLowerCase() }))
                .addFields(fields)
                .setTimestamp();

            await interaction.reply({ embeds: [leaderboardEmbed] });
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

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}