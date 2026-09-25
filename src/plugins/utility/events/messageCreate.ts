import type { Message } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getLevelsConfig, isOnCooldown, awardXp } from '../../../utils/xp.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'messageCreate',
    once: false,

    async execute(message: Message): Promise<void> {
        // Ignore DMs and bots
        if (!message.guild) { return; }
        if (message.author.bot) { return; }

        try {
            const cfg = await getLevelsConfig(message.guild.id);

            if (!cfg.enabled) { return; }

            // Award XP subject to cooldown
            if (isOnCooldown(message.guild.id, message.author.id, cfg.cooldown)) { return; }

            const amount = Math.floor(Math.random() * (cfg.maxXp - cfg.minXp + 1)) + cfg.minXp;
            const { data, leveledUp } = await awardXp(message.guild.id, message.author.id, amount);

            if (leveledUp && cfg.announceLevelUp) {
                const resolvedLocale = await i18n.resolveLocale({
                    locale: null,
                    guildLocale: message.guild.preferredLocale ?? null,
                    guildId: message.guild.id
                });
                const t = i18n.getFixedT(resolvedLocale, 'utility');
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle(t('levelup.title'))
                    .setDescription(t('levelup.description', { mention: `<@${message.author.id}>`, level: data.level }))
                    .setTimestamp();

                // @ts-expect-error - channel.send exists on text-based channels
                await message.channel.send({ embeds: [embed] }).catch(() => undefined);
            }

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] XP award failed:' });
        }
    }
};