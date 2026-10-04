import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleExemptRole(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const role = interaction.options.getRole('role', true);
    const action = interaction.options.getString('action', true);

    const guildConfig = await getGuildData('automod', interaction.guild!.id);
    const exemptRoles = guildConfig['exemptRoles'] as string[] ?? [];
    guildConfig['exemptRoles'] = exemptRoles;

    if (action === 'add') {
        if (exemptRoles.includes(role.id)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: t('exemptRole.alreadyTitle'),
                    description: t('exemptRole.alreadyDescription', { role: role.id }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        exemptRoles.push(role.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: t('exemptRole.exemptedTitle'),
                description: t('exemptRole.exemptedDescription', { role: role.id }),
                timestamp: new Date().toISOString()
            }]
        });
    } else {
        if (!exemptRoles.includes(role.id)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFFFF00,
                    title: t('exemptRole.notExemptTitle'),
                    description: t('exemptRole.notExemptDescription', { role: role.id }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        guildConfig['exemptRoles'] = exemptRoles.filter((id: string) => id !== role.id);
        await setGuildData('automod', interaction.guild!.id, guildConfig);

        await interaction.reply({
            embeds: [{
                color: 0x00FF00,
                title: t('exemptRole.removedTitle'),
                description: t('exemptRole.removedDescription', { role: role.id }),
                timestamp: new Date().toISOString()
            }]
        });
    }
}
