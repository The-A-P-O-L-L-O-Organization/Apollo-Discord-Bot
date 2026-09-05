import { Message } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import { getLevelsConfig, isOnCooldown, awardXp } from '../../../utils/xp.js';

interface LevelData {
    level: number;
    xp: number;
    messages: number;
}

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
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('[LEVEL UP]')
                    .setDescription(`${message.author} reached level **${data.level}**!`)
                    .setTimestamp();
                
                // @ts-expect-error - channel.send exists on text-based channels
await message.channel.send({ embeds: [embed] }).catch(() => {});
            }
            
        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] XP award failed:' });
        }
    }
};