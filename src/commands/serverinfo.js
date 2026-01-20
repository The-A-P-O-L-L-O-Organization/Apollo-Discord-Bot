// Server Info Command
// Displays detailed information about the server

import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about the server'),
    category: 'utility',

    async execute(interaction) {
        const { guild } = interaction;

        // Fetch the guild to ensure we have the most up-to-date info
        await guild.fetch();

        // Fetch the owner
        const owner = await guild.fetchOwner();

        // Count channels by type
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
        const forumChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildForum).size;
        const stageChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildStageVoice).size;

        // Member stats
        const totalMembers = guild.memberCount;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const humanCount = totalMembers - botCount;

        // Get boost info
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;

        // Get verification level
        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Highest'
        };

        // Get explicit content filter
        const contentFilterLevels = {
            0: 'Disabled',
            1: 'Members without roles',
            2: 'All members'
        };

        // Create the embed
        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
            .addFields(
                { 
                    name: 'General', 
                    value: [
                        `**Owner:** ${owner.user.tag}`,
                        `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                        `**Server ID:** ${guild.id}`
                    ].join('\n'),
                    inline: false 
                },
                { 
                    name: `Members (${totalMembers})`, 
                    value: [
                        `**Humans:** ${humanCount}`,
                        `**Bots:** ${botCount}`
                    ].join('\n'),
                    inline: true 
                },
                { 
                    name: `Channels (${guild.channels.cache.size})`, 
                    value: [
                        `**Text:** ${textChannels}`,
                        `**Voice:** ${voiceChannels}`,
                        `**Categories:** ${categories}`,
                        forumChannels > 0 ? `**Forum:** ${forumChannels}` : null,
                        stageChannels > 0 ? `**Stage:** ${stageChannels}` : null
                    ].filter(Boolean).join('\n'),
                    inline: true 
                },
                { 
                    name: 'Other', 
                    value: [
                        `**Roles:** ${guild.roles.cache.size}`,
                        `**Emojis:** ${guild.emojis.cache.size}`,
                        `**Stickers:** ${guild.stickers.cache.size}`
                    ].join('\n'),
                    inline: true 
                },
                { 
                    name: 'Boost Status', 
                    value: [
                        `**Level:** ${boostLevel}`,
                        `**Boosts:** ${boostCount}`
                    ].join('\n'),
                    inline: true 
                },
                { 
                    name: 'Security', 
                    value: [
                        `**Verification:** ${verificationLevels[guild.verificationLevel]}`,
                        `**Content Filter:** ${contentFilterLevels[guild.explicitContentFilter]}`
                    ].join('\n'),
                    inline: true 
                }
            )
            .setTimestamp()
            .setFooter({ text: `Requested by ${interaction.user.tag}` });

        // Add banner if available
        if (guild.bannerURL()) {
            embed.setImage(guild.bannerURL({ size: 512 }));
        }

        // Add description if available
        if (guild.description) {
            embed.setDescription(guild.description);
        }

        return interaction.reply({ embeds: [embed] });
    }
};
