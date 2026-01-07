// Guild Member Add Event Handler
// This event fires when a new member joins the server

import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

export default async function guildMemberAddHandler(member) {
    const { guild } = member;
    
    // Find the welcome channel
    const welcomeChannel = guild.channels.cache.find(
        channel => channel.name === config.welcome.channelName
    );
    
    // If no welcome channel found, try to use the system channel or first available channel
    const targetChannel = welcomeChannel || guild.systemChannel || guild.channels.cache.first();
    
    if (!targetChannel) {
        console.log('❌ No suitable channel found for welcome message');
        return;
    }
    
    // Create an embedded welcome message
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green color
        .setTitle('🎉 Welcome to the Server! 🎉')
        .setDescription(
            config.welcome.message
                .replace('{user}', member.toString()) // Mentions the user
                .replace('{server}', guild.name)
        )
        .addFields(
            {
                name: '👤 New Member',
                value: member.user.tag,
                inline: true
            },
            {
                name: '🆔 Member ID',
                value: member.id,
                inline: true
            },
            {
                name: '📅 Joined At',
                value: new Date().toLocaleString(),
                inline: true
            }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({
            text: `Total Members: ${guild.memberCount}`,
            iconURL: guild.iconURL()
        })
        .setTimestamp();
    
    // Send the welcome message
    try {
        await targetChannel.send({
            content: `Hey ${member.toString()}! 👋`,
            embeds: [welcomeEmbed]
        });
        console.log(`✅ Welcome message sent for ${member.user.tag}`);
    } catch (error) {
        console.error('❌ Error sending welcome message:', error);
    }
}

