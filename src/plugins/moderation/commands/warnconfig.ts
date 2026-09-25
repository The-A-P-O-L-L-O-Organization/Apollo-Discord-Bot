// Warn Config Command - Configure warning system thresholds
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface WarningThresholds {
    mute: number | null;
    kick: number | null;
    ban: number | null;
}

interface WarningConfig {
    thresholds?: WarningThresholds;
    muteDuration?: number;
    [key: string]: unknown;
}

function parseDuration(str: string): number | null {
    const match = /^(\d+)([mhdw])$/i.exec(str);
    if (!match) {return null;}

    const numPart = match[1];
    const unitPart = match[2];
    if (numPart === undefined || unitPart === undefined) {return null;}

    const value = parseInt(numPart, 10);
    const unit = unitPart.toLowerCase();

    const multipliers: Record<string, number> = {
        'm': 60000,
        'h': 3600000,
        'd': 86400000,
        'w': 604800000
    };

    const multiplier = multipliers[unit];
    if (!multiplier) {return null;}

    return value * multiplier;
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {return `${days} day(s)`;}
    if (hours > 0) {return `${hours} hour(s)`;}
    if (minutes > 0) {return `${minutes} minute(s)`;}
    return `${seconds} second(s)`;
}

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const guildConfig = (await getGuildData('warnings-config', interaction.guild!.id)) as WarningConfig | null;
    const thresholds = guildConfig?.thresholds ?? config.warnings.thresholds;
    const muteDuration = guildConfig?.muteDuration ?? config.warnings.muteDuration;

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(t('warnconfig.warningConfiguration'))
        .setDescription(t('warnconfig.currentWarningThresholdsForServer', { server: interaction.guild!.name }))
        .addFields(
            {
                name: t('warnconfig.muteAutoMuteThreshold'),
                value: thresholds.mute ? `${thresholds.mute} warnings` : 'Disabled',
                inline: true
            },
            {
                name: t('warnconfig.kickAutoKickThreshold'),
                value: thresholds.kick ? `${thresholds.kick} warnings` : 'Disabled',
                inline: true
            },
            {
                name: t('warnconfig.banAutoBanThreshold'),
                value: thresholds.ban ? `${thresholds.ban} warnings` : 'Disabled',
                inline: true
            },
            {
                name: t('warnconfig.timeAutoMuteDuration'),
                value: formatDuration(muteDuration),
                inline: true
            }
        )
        .addFields({
            name: t('warnconfig.howItWorks'),
            value: t('warnconfig.whenAUserReachesThe'),
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: t('warnconfig.useWarnconfigSetToModify') });

    await interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const action = interaction.options.getString('action', true);
    const warnings = interaction.options.getInteger('warnings', true);

    const guildConfig = (await getGuildData('warnings-config', interaction.guild!.id)) as WarningConfig | null ?? {};

    guildConfig.thresholds ??= { ...config.warnings.thresholds };

    guildConfig.thresholds[action as keyof WarningThresholds] = warnings === 0 ? null : warnings;

    const { mute, kick, ban } = guildConfig.thresholds;
    if (mute && kick && mute >= kick) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('warnconfig.errorInvalidConfiguration'),
                description: t('warnconfig.muteThresholdMustBeLess'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (kick && ban && kick >= ban) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('warnconfig.errorInvalidConfiguration2'),
                description: t('warnconfig.kickThresholdMustBeLess'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    if (mute && ban && mute >= ban) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('warnconfig.errorInvalidConfiguration3'),
                description: t('warnconfig.muteThresholdMustBeLess2'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await setGuildData('warnings-config', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('warnconfig.successThresholdUpdated'))
        .setDescription(
            warnings === 0
                ? `Auto-**${action}** has been **disabled**.`
                : `Auto-**${action}** will now trigger at **${warnings}** warnings.`
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info({ msg: `[CONFIG] Warning ${action} threshold set to ${warnings} in ${interaction.guild!.name}` });
}

async function handleSetMuteDuration(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const durationStr = interaction.options.getString('duration', true);

    const ms = parseDuration(durationStr);

    if (!ms) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('warnconfig.errorInvalidDuration'),
                description: 'Please use a valid duration format: `1m`, `1h`, `1d`, `1w`',
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const guildConfig = (await getGuildData('warnings-config', interaction.guild!.id)) as WarningConfig | null ?? {};
    guildConfig.muteDuration = ms;

    await setGuildData('warnings-config', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('warnconfig.successMuteDurationUpdated'))
        .setDescription(t('warnconfig.autoMuteDurationSetTo', { value: formatDuration(ms) }))
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info({ msg: `[CONFIG] Warning mute duration set to ${ms}ms in ${interaction.guild!.name}` });
}

async function handleReset(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    await setGuildData('warnings-config', interaction.guild!.id, {});

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('warnconfig.successConfigurationReset'))
        .setDescription(t('warnconfig.warningConfigurationHasBeenReset'))
        .addFields(
            { name: t('warnconfig.autoMute'), value: t('warnconfig.countWarnings', { count: config.warnings.thresholds.mute }), inline: true },
            { name: t('warnconfig.autoKick'), value: t('warnconfig.countWarnings2', { count: config.warnings.thresholds.kick }), inline: true },
            { name: t('warnconfig.autoBan'), value: t('warnconfig.countWarnings3', { count: config.warnings.thresholds.ban }), inline: true },
            { name: t('warnconfig.muteDuration'), value: formatDuration(config.warnings.muteDuration), inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info({ msg: `[CONFIG] Warning config reset in ${interaction.guild!.name}` });
}

export default {
    name: 'warnconfig',
    description: 'Configure warning system thresholds',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'view',
            description: 'View current warning configuration',
            type: 1
        },
        {
            name: 'set',
            description: 'Set a warning threshold',
            type: 1,
            options: [
                {
                    name: 'action',
                    description: 'The punishment action',
                    type: 3,
                    required: true,
                    choices: [
                        { name: 'Mute', value: 'mute' },
                        { name: 'Kick', value: 'kick' },
                        { name: 'Ban', value: 'ban' }
                    ]
                },
                {
                    name: 'warnings',
                    description: 'Number of warnings to trigger action (0 to disable)',
                    type: 4,
                    required: true,
                    min_value: 0,
                    max_value: 100
                }
            ]
        },
        {
            name: 'setmuteduration',
            description: 'Set auto-mute duration',
            type: 1,
            options: [
                {
                    name: 'duration',
                    description: 'Duration (e.g., 1h, 1d, 1w)',
                    type: 3,
                    required: true
                }
            ]
        },
        {
            name: 'reset',
            description: 'Reset to default configuration',
            type: 1
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const subcommand = interaction.options.getSubcommand();

            try {
                switch (subcommand) {
                case 'view':
                    await handleView(interaction);
                    break;
                case 'set':
                    await handleSet(interaction);
                    break;
                case 'setmuteduration':
                    await handleSetMuteDuration(interaction);
                    break;
                case 'reset':
                    await handleReset(interaction);
                    break;
                }
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Warn config command error' });

                await interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: t('warnconfig.commandFailedTitle'),
                        description: t('warnconfig.anErrorOccurredWhileConfiguring'),
                        fields: [{ name: t('warnconfig.error'), value: (error as Error).message }],
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('warnconfig.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};