import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleExemptChannel(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const channel = interaction.options.getChannel('channel', true);
    const action = interaction.options.getString('action', true);

    const guildConfig = await getGuildData('automod', interaction.guild!.id);
    const exemptChannels = guildConfig['exemptChannels'] as string[] ?? [];
    guildConfig['exemptChannels'] = exemptChannels;

    if (action === 'add') {
        if (exemptChannels.includes(channel.id)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: t('exemptChannel.alreadyTitle'),
                    description: t('exemptChannel.alreadyDescription', { channel: channel.id }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        exemptChannels.push(channel.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: t('exemptChannel.exemptedTitle'),
                description: t('exemptChannel.exemptedDescription', { channel: channel.id }),
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!exemptChannels.includes(channel.id)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: t('exemptChannel.notExemptTitle'),
                    description: t('exemptChannel.notExemptDescription', { channel: channel.id }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        guildConfig['exemptChannels'] = exemptChannels.filter((id: string) => id !== channel.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: t('exemptChannel.removedTitle'),
                description: t('exemptChannel.removedDescription', { channel: channel.id }),
                timestamp: new Date().toISOString()
            }]
        });
    }
}
