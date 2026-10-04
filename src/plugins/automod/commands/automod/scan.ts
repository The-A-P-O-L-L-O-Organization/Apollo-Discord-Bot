import type { ChatInputCommandInteraction, FetchMessagesOptions, GuildTextBasedChannel } from 'discord.js';
import { PermissionsBitField, EmbedBuilder, MessageFlags } from 'discord.js';
import { getAutomodConfig } from '../../../../utils/automod.js';
import { checkMessageAttachments } from '../../../../utils/nsfwDetection.js';
import { logger } from '../../../../utils/logger.js';
import { safeError } from '../../../../utils/safeError.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleScan(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    try {
        const channel = interaction.options.getChannel('channel', true) as GuildTextBasedChannel;
        const limit = interaction.options.getInteger('limit') ?? 100;
        const user = interaction.options.getUser('user');
        const deleteEnabled = interaction.options.getBoolean('delete') ?? false;

        // Check if NSFW filter is enabled for this guild
        const cfg = await getAutomodConfig(interaction.guild!.id);
        if (!cfg.nsfwFilter) {
            await interaction.reply({ content: t('scan.nsfwDisabled'), flags: MessageFlags.Ephemeral });
            return;
        }

        // Validate channel is text-based and in guild
        if (!channel.isTextBased() || !channel.guild) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('scan.invalidChannelTitle'),
                    description: t('scan.invalidChannelDescription'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Check if bot can read messages in the channel
        if (!channel.viewable) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('scan.permissionDeniedTitle'),
                    description: t('scan.permissionDeniedDescription'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let messagesScanned = 0;
        let nsfwFound = 0;
        let messagesDeleted = 0;
        let lastId: string | null = null;
        const batchSize = 100; // Discord API limit per request

        // Fetch and scan messages in batches
        while (messagesScanned < limit) {
            const remaining = limit - messagesScanned;
            const fetchCount = Math.min(batchSize, remaining);
            const options: FetchMessagesOptions = { limit: fetchCount };
            if (lastId) { options.before = lastId; }

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) { break; }

            for (const [, msg] of messages) {
                // Skip if user filter is set and doesn't match
                if (user && msg.author.id !== user.id) { continue; }
                // Check if channel is exempt
                if (cfg.exemptChannels?.includes(msg.channel.id)) { continue; }
                // Check if any of the member's roles are exempt
                if (cfg.exemptRoles?.some(r => msg.member?.roles.cache.has(r))) { continue; }

                // Check message attachments for NSFW
                const result = await checkMessageAttachments(interaction.guild!.id, msg);
                messagesScanned++;

                if (result) {
                    nsfwFound++;
                    if (deleteEnabled && result.shouldDelete) {
                        // Check if bot has permission to delete messages in this channel
                        if (channel.permissionsFor(interaction.guild!.members.me!).has(PermissionsBitField.Flags.ManageMessages)) {
                            try {
                                await msg.delete();
                                messagesDeleted++;
                            } catch (delError) {
                                logger.error({ msg: '[ERROR] Failed to delete NSFW message', error: delError, messageId: msg.id });
                            }
                        }
                    }
                }

                // Delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));

                // Update progress every 100 messages or at the end
                if (messagesScanned % 100 === 0 || messagesScanned === limit) {
                    await interaction.editReply({
                        embeds: [{
                            color: 0x0099FF,
                            title: t('scan.progressTitle'),
                            description: t('scan.progressDescription', { channel: channel.id }),
                            fields: [
                                { name: t('scan.fieldScanned'), value: `${messagesScanned}/${limit}`, inline: true },
                                { name: t('scan.fieldDetected'), value: `${nsfwFound}`, inline: true },
                                { name: t('scan.fieldDeleted'), value: `${messagesDeleted}`, inline: true }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    });
                }

                if (messagesScanned >= limit) { break; }
            }

            // Set lastId to the oldest message in this batch for pagination
            const oldestMessage = messages.last();
            if (oldestMessage) {
                lastId = oldestMessage.id;
            } else {
                break;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Final results
        const embed = new EmbedBuilder()
            .setColor(nsfwFound > 0 ? '#FF0000' : '#00FF00')
            .setTitle(t('scan.completeTitle'))
            .setDescription(t('scan.completeDescription', { count: messagesScanned, channel: channel.id }))
            .addFields(
                { name: t('scan.fieldDetectedTitle'), value: `${nsfwFound}`, inline: true },
                { name: t('scan.fieldDeleted'), value: `${messagesDeleted}`, inline: true },
                { name: t('scan.fieldChannel'), value: channel.toString(), inline: true }
            )
            .setTimestamp();

        if (user) {
            embed.addFields({ name: t('scan.fieldUserFilter'), value: user.toString(), inline: true });
        }
        if (deleteEnabled) {
            embed.addFields({ name: t('scan.fieldDeleteEnabled'), value: t('scan.yes'), inline: true });
        }

        await interaction.editReply({ embeds: [embed] });
        logger.info({ msg: '[AUTOMOD] NSFW scan completed', channel: channel.name, guild: interaction.guild!.name });

    } catch (error) {
        await interaction.editReply({
            embeds: [{
                color: 0xFF0000,
                title: t('scan.failedTitle'),
                description: t('scan.failedDescription'),
                fields: [{ name: t('scan.fieldError'), value: safeError(error) }],
                timestamp: new Date().toISOString()
            }]
        });
        logger.error({ msg: '[ERROR] NSFW scan error', error });
    }
}
