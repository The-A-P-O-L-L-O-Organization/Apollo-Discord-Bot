// Message Create Event (Utility)
// Awards XP for messages and announces level-ups
import { logger } from '../../../utils/logger.js';

import { EmbedBuilder } from 'discord.js';
import { getLevelsConfig, isOnCooldown, awardXp } from '../../../utils/xp.js';

export default {
    name: 'messageCreate',
    once: false,
    
    async execute(message, client) {
        // Ignore DMs and bots
        if (!message.guild) {return;}
        if (message.author.bot) {return;}
        
        try {
            const cfg = await getLevelsConfig(message.guild.id);
            
            if (!cfg.enabled) {return;}
            
            // Award XP subject to cooldown
            if (isOnCooldown(message.guild.id, message.author.id, cfg.cooldown)) {return;}
            
            const amount = Math.floor(Math.random() * (cfg.maxXp - cfg.minXp + 1)) + cfg.minXp;
            const { data, leveledUp } = await awardXp(message.guild.id, message.author.id, amount);
            
            if (leveledUp && cfg.announceLevelUp) {
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('[LEVEL UP]')
                    .setDescription(`${message.author} reached level **${data.level}**!`)
                    .setTimestamp();
                
                await message.channel.send({ embeds: [embed] }).catch(() => {});
            }
            
        } catch (error) {
            logger.error('[ERROR] XP award failed:', error);
        }
    }
};
