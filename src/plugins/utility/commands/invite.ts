import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    // Invite Command
    // Generate an invite link for the bot or create a server invite
    name: 'invite',
    description: 'Generate an invite link or create a server invite',
    category: 'utility',
    dmPermission: true,
    options: [
        {
            name: 'type',
            description: 'Type of invite to create',
            type: 3, // STRING
            required: false,
            choices: [
                { name: 'Bot Invite', value: 'bot' },
                { name: 'Server Invite', value: 'server' }
            ]
        },
        {
            name: 'max_age',
            description: 'Invite expiration time (0 = never)',
            type: 4, // INTEGER
            required: false
        },
        {
            name: 'max_uses',
            description: 'Maximum number of uses (0 = unlimited)',
            type: 4, // INTEGER
            required: false
        },
        {
            name: 'temporary',
            description: 'Kick members after they close the app',
            type: 5, // BOOLEAN
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const type = interaction.options.getString('type') ?? 'bot';

            if (type === 'bot') {
                // Generate bot invite
                const inviteLink = `https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`;

                const inviteEmbed = {
                    color: 0x3498DB,
                    title: t('invite.botTitle'),
                    description: t('invite.botDesc'),
                    fields: [
                        {
                            name: t('invite.addBot'),
                            value: `[${t('invite.clickHere')}](${inviteLink})`,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [inviteEmbed] });

            } else if (type === 'server') {
                // Check if in guild
                if (!interaction.guild) {
                    await interaction.reply({
                        content: t('invite.serverOnly'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Check permissions
                const me = interaction.guild.members.me;
                if (!me?.permissions.has(PermissionsBitField.Flags.CreateInstantInvite)) {
                    await interaction.reply({
                        content: t('invite.noPerm'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const maxAge = interaction.options.getInteger('max_age') ?? 0;
                const maxUses = interaction.options.getInteger('max_uses') ?? 0;
                const temporary = interaction.options.getBoolean('temporary') ?? false;

                // Create invite
                const channel = interaction.channel;
                if (!channel || !('createInvite' in channel)) {
                    await interaction.reply({
                        content: t('invite.noChannel'),
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const invite = await channel.createInvite({
                    maxAge: maxAge,
                    maxUses: maxUses,
                    temporary: temporary,
                    reason: `Created by ${interaction.user.tag}`
                });

                const inviteEmbed = {
                    color: 0x00FF00,
                    title: t('invite.createdTitle'),
                    description: t('invite.createdDesc', { channel: 'name' in channel ? channel.name : 'unknown' }),
                    fields: [
                        {
                            name: t('invite.link'),
                            value: invite.url,
                            inline: false
                        },
                        {
                            name: t('invite.expires'),
                            value: maxAge > 0 ? t('invite.inMinutes', { count: maxAge / 60 }) : t('invite.never'),
                            inline: true
                        },
                        {
                            name: t('invite.maxUses'),
                            value: maxUses > 0 ? t('invite.usesValue', { count: maxUses }) : t('invite.unlimited'),
                            inline: true
                        },
                        {
                            name: t('invite.temporary'),
                            value: temporary ? t('invite.yes') : t('invite.no'),
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [inviteEmbed] });

                logger.info({ msg: `[INFO] Invite created by ${interaction.user.tag}: ${invite.url}` });
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};