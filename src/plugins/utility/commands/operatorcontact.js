import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../../../config/config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('operator-contact')
        .setDescription('View the contact information for this bot instance\'s operator')
        .setDMPermission(true),
    name: 'operator-contact',
    description: 'View the contact information for this bot instance\'s operator',
    category: 'utility',
    dmPermission: true,

    async execute(interaction) {
        const operator = config.operator;

        if (!operator || operator.agreed !== true || !operator.contact || operator.contact.trim().length === 0) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Operator Contact Not Configured')
                .setDescription(
                    'The operator of this bot instance has not published contact information. ' +
                    'If you need to reach the operator, ask a server administrator in the Discord server ' +
                    'where you encountered this bot.'
                )
                .setTimestamp();

            return interaction.reply({
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('Operator Contact')
            .setDescription(
                'The operator of this bot instance has published the following contact information. ' +
                'Use it for privacy requests, data deletion requests, and reports of bot misbehavior.'
            )
            .addFields(
                { name: 'Contact', value: operator.contact, inline: false }
            )
            .setFooter({ text: 'This bot is self-hosted. The operator is not affiliated with Discord or the upstream Apollo project.' })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }
};
