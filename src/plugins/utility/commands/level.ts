import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, User } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData } from '../../../utils/db.js';
import { calculateXPForLevel } from '../../../utils/xp.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface LevelData {
    xp: number;
    level: number;
    messages: number;
}

export default {
    name: 'level',
    description: 'View your current level and experience points',
    category: 'Utility',
    
    dmPermission: true,
    options: [
        { name: 'user', description: 'User to check level for', type: 6, required: false }
    ],
    
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const user = interaction.options.getUser('user') ?? interaction.user;
            
            const levelData = await getUserData('levels', interaction.guild!.id, user.id);
            const typedLevelData = (levelData as unknown as LevelData) ?? {
                xp: 0,
                level: 0,
                messages: 0
            };
            
            const xpForNextLevel = calculateXPForLevel(typedLevelData.level + 1);
            const currentLevelXP = calculateXPForLevel(typedLevelData.level);
            const xpProgress = typedLevelData.xp - currentLevelXP;
            const xpNeeded = xpForNextLevel - currentLevelXP;
            const progressPercent = Math.floor((xpProgress / xpNeeded) * 100);
            
            const progressBar = createProgressBar(progressPercent);
            
            const levelEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`[LEVEL] ${user.tag}`)
                .setDescription(`${user}'s level and experience`)
                .addFields(
                    { name: '[INFO] Level', value: `**${typedLevelData.level}**`, inline: true },
                    { name: '[INFO] XP', value: `**${formatNumber(typedLevelData.xp)}** / ${formatNumber(xpForNextLevel)}`, inline: true },
                    { name: '[INFO] Total Messages', value: `${formatNumber(typedLevelData.messages)}`, inline: true },
                    { name: `[PROGRESS] To Level ${typedLevelData.level + 1}`, value: `${progressBar} ${progressPercent}%`, inline: false },
                    { name: '[INFO] XP Needed', value: `${formatNumber(xpNeeded - xpProgress)} more XP`, inline: true }
                )
                .setTimestamp();
            
            if (user.displayAvatarURL()) {
                levelEmbed.setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }));
            }
            
            await interaction.reply({ embeds: [levelEmbed] });
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

function createProgressBar(percent: number, length = 20): string {
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}