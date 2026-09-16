// Strike Command - Issue a strike to a user (more severe than warnings)
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData, appendToUserArray, generateId, getGuildData } from '../../../utils/db.ts';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';

interface StrikeEntry {
    id: string;
    reason: string;
    moderatorId: string;
    moderatorTag: string;
    timestamp: number;
    active?: boolean;
}

interface StrikeConfig {
    banThreshold?: number;
    autoKick?: boolean;
    kickThreshold?: number;
    [key: string]: unknown;
}

export default {
    name: 'strike',
    description: 'Issue a strike to a user (more severe than warnings)',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to strike',
            type: 6,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the strike',
            type: 3,
            required: true
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason', true);

            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user to strike.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (user.bot) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Target',
                        description: 'You cannot strike bots.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (user.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Self Action',
                        description: 'You cannot strike yourself.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Member Not Found',
                        description: 'This user is not a member of the server.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Hierarchy Check Failed',
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const strike = {
                id: generateId(),
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                timestamp: Date.now(),
                active: true
            };

            await appendToUserArray('strikes', interaction.guild!.id, user.id, strike);

            const userStrikes = (await getUserData('strikes', interaction.guild!.id, user.id)) as StrikeEntry[] || [];
            const activeStrikes = userStrikes.filter(s => s.active !== false);
            const strikeCount = activeStrikes.length;

            const guildSettings = (await getGuildData('strike-config', interaction.guild!.id)) as StrikeConfig;
            const threshold = guildSettings.banThreshold || 3;
            const autoKick = guildSettings.autoKick ?? true;
            const kickThreshold = guildSettings.kickThreshold || 2;

            let dmSent = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(`[!] Strike Issued in ${interaction.guild!.name}`)
                    .setDescription('You have been issued a **strike** by a moderator.')
                    .addFields(
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Total Strikes', value: `${strikeCount}/${threshold}`, inline: true },
                        { name: 'Strike ID', value: strike.id, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `${threshold - strikeCount} strike(s) remaining before ban` });

                await user.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch {
                logger.info({ msg: `[INFO] Could not DM user ${user.tag} about strike` });
            }

            let autoPunishment: string | null = null;

            if (strikeCount >= threshold) {
                try {
                    await interaction.guild!.bans.create(user.id, {
                        reason: `Auto-ban: Reached ${strikeCount} strikes. Latest: ${reason}`
                    });
                    autoPunishment = 'banned';
                } catch (banError) {
                    logger.error({ err: banError, msg: '[ERROR] Auto-ban failed' });
                }
            } else if (autoKick && strikeCount >= kickThreshold) {
                try {
                    if (member.kickable) {
                        await member.kick(`Auto-kick: Reached ${strikeCount} strikes. Latest: ${reason}`);
                        autoPunishment = 'kicked';
                    }
                } catch (kickError) {
                    logger.error({ err: kickError, msg: '[ERROR] Auto-kick failed' });
                }
            }

            const successEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('[SUCCESS] Strike Issued')
                .setDescription(`${user.tag} has been issued a strike.`)
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Strikes', value: `${strikeCount}/${threshold}`, inline: true },
                    { name: 'Strike ID', value: strike.id, inline: true },
                    { name: 'DM Sent', value: dmSent ? 'Yes' : 'No', inline: true }
                )
                .setTimestamp();

            if (autoPunishment) {
                successEmbed.addFields({
                    name: '[!] Auto-Punishment Applied',
                    value: `User has been **${autoPunishment}** for reaching ${strikeCount} strikes.`,
                    inline: false
                });
            } else {
                successEmbed.addFields({
                    name: 'Remaining',
                    value: `${threshold - strikeCount} strike(s) until ban`,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'strike',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Strike Count': `${strikeCount}/${threshold}`,
                    'Strike ID': strike.id,
                    'Auto-Punishment': autoPunishment || 'None'
                }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} struck by ${interaction.user.tag}. Total: ${strikeCount}. Reason: ${reason}` });

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while issuing the strike.',
                fields: [{ name: 'Error', value: safeError(error), inline: true }],
                timestamp: new Date().toISOString()
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};