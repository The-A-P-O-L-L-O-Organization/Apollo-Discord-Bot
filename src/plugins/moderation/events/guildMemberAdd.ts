import { EmbedBuilder } from 'discord.js';
import type { GuildMember, GuildBasedChannel, TextChannel } from 'discord.js';
import { config } from '../../../config/config.js';
import { logEvent, createMemberJoinEmbed } from '../../../utils/guildLogging.js';
import { getGuildData, getData, updateGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { checkRaidPattern, handleRaidDetected, checkRaidPatternRedis, trackJoinRedis } from '../../../utils/raidDetection.js';
import { getLockRedis } from '../../../utils/lock.js';
import { trackMemberChange } from '../../../utils/analyticsCollector.js';
import { i18n } from '../../../i18n/index.js';

interface BlacklistEntry {
    reason?: string;
    moderatorTag?: string;
    moderatorId?: string;
}

export default {
    name: 'guildMemberAdd',
    once: false,
    async execute(member: GuildMember, _client: unknown) {
        const { guild } = member;

        // Track member join for analytics
        trackMemberChange(guild.id, true, guild.memberCount);

        // --- Raid Detection ---
        if (!member.user.bot) {
            let isRaid = false;

            // Try Redis-backed raid detection if enabled
            if (config.automod.useRedisRaidDetection) {
                const redis = await getLockRedis();
                if (redis) {
                    const accountAge = Date.now() - member.user.createdTimestamp;
                    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
                    await trackJoinRedis(guild.id, member.user.id, member.user.username, Date.now(), accountAgeDays);
                    isRaid = (await checkRaidPatternRedis(guild.id, 5, 10000, Date.now())).detected;
                } else {
                    // Fallback to in-memory
                    isRaid = await checkRaidPattern(guild.id, member);
                }
            } else {
                // Use in-memory detection
                isRaid = await checkRaidPattern(guild.id, member);
            }

            if (isRaid) {
                await handleRaidDetected(guild, member);
            }
        }

        // --- Blacklist check ---
        if (!member.user.bot) {
            const globalData = await getData('global_blacklist');
            const globalEntries = (globalData['entries'] ?? {}) as Record<string, BlacklistEntry>;
            let entry: BlacklistEntry | undefined = globalEntries[member.id];
            let isGlobal = false;

            if (entry) {
                isGlobal = true;
            } else {
                const guildData = await getGuildData('blacklist', guild.id);
                const entries = (guildData['entries'] ?? {}) as Record<string, BlacklistEntry>;
                entry = entries[member.id];
            }

            if (entry) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle(`You have been banned from ${guild.name}`)
                        .setDescription(isGlobal
                            ? 'You are on the global blacklist and have been automatically banned from all servers using this bot.'
                            : 'You are on this server\'s blacklist and have been automatically banned.'
                        )
                        .addFields(
                            { name: 'Reason', value: entry.reason ?? 'No reason provided', inline: false },
                            { name: 'Blacklisted By', value: entry.moderatorTag ?? 'Unknown', inline: true },
                            { name: 'Server', value: guild.name, inline: true },
                            { name: 'Scope', value: isGlobal ? 'Global (All Servers)' : 'This Server Only', inline: true }
                        )
                        .setFooter({ text: 'If you believe this is a mistake, please contact the server staff.' })
                        .setTimestamp();

                    await member.user.send({ embeds: [dmEmbed] });
                } catch (dmError) {
                    console.log(`[INFO] Could not DM blacklisted user ${member.user.tag}: ${(dmError as Error).message}`);
                }

                try {
                    await guild.bans.create(member.id, {
                        reason: `Blacklisted${isGlobal ? ' (Global)' : ''}: ${entry.reason}`
                    });

                    await sendModLog(guild, {
                        action: 'ban',
                        target: member.user,
                        moderator: { tag: entry.moderatorTag ?? 'Unknown', id: entry.moderatorId ?? 'Unknown' },
                        reason: `Auto-ban (${isGlobal ? 'global ' : ''}blacklisted): ${entry.reason}`,
                        extra: {
                            'Trigger': 'Server join',
                            'Originally Blacklisted By': entry.moderatorTag,
                            'Blacklist Scope': isGlobal ? 'Global' : 'Server'
                        }
                    });

                    console.log(`[MODERATION] ${isGlobal ? 'Globally ' : ''}Blacklisted user ${member.user.tag} was banned on join${isGlobal ? ' (global)' : ''}. Reason: ${entry.reason}`);
                } catch (banError) {
                    console.error(`[ERROR] Failed to ban blacklisted user ${member.user.tag}:`, banError);
                }

                return;
            }
        }

        // --- Auto-role assignment ---
        if (!member.user.bot) {
            const autoRoleConfig = await getGuildData('autorole', guild.id);

            if (autoRoleConfig?.['enabled'] && autoRoleConfig['roleId']) {
                const role = guild.roles.cache.get(autoRoleConfig['roleId'] as string);

                if (role) {
                    try {
                        await member.roles.add(role, 'Auto-role on join');
                        console.log(`[SUCCESS] Auto-role ${role.name} assigned to ${member.user.tag}`);
                    } catch (roleError) {
                        console.error(`[ERROR] Failed to assign auto-role to ${member.user.tag}:`, roleError);
                    }
                }
            }

            const rolePersistenceConfig = await getGuildData('role-persistence', guild.id);

            if (rolePersistenceConfig?.['enabled'] && rolePersistenceConfig['savedRoles']) {
                const savedRoles = rolePersistenceConfig['savedRoles'] as Record<string, { roles?: string[] }>;
                const savedData = savedRoles[member.id];

                if (savedData?.roles && savedData.roles.length > 0) {
                    const validRoles = savedData.roles
                        .flatMap((roleId: string) => {
                            const r = guild.roles.cache.get(roleId);
                            return r ? [r] : [];
                        });

                    if (validRoles.length > 0) {
                        try {
                            await member.roles.add(validRoles, 'Restoring roles from previous session');
                            console.log(`[SUCCESS] Restored ${validRoles.length} roles for ${member.user.tag}`);

                            await updateGuildData('role-persistence', guild.id, (data) => {
                                const saved = data['savedRoles'] as Record<string, { roles?: string[] }> | undefined;
                                if (saved) {
                                    delete saved[member.id];
                                }
                                return data;
                            });
                        } catch (roleError) {
                            console.error(`[ERROR] Failed to restore roles for ${member.user.tag}:`, roleError);
                        }
                    }
                }
            }
        }

        if (!member.user.bot) {
            const logEmbed = createMemberJoinEmbed(member);
            await logEvent(guild, 'memberJoin', logEmbed);
        }

        const me = guild.members.me;
        if (!me) {
            console.log('[INFO] Bot member not cached — skipping welcome message');
            return;
        }

        const canSend = (ch: GuildBasedChannel) => ch.isTextBased() && ch.permissionsFor(me)?.has('SendMessages');

        const welcomeChannel = guild.channels.cache.find(
            (ch) => ch.name === config.welcome.channelName
        );

        const targetChannel = (welcomeChannel && canSend(welcomeChannel))
            ? welcomeChannel
            : (guild.systemChannel && canSend(guild.systemChannel))
                ? guild.systemChannel
                : null;

        if (!targetChannel) {
            console.log(`[INFO] Welcome channel "${config.welcome.channelName}" unavailable or missing SendMessages — skipping welcome message`);
            return;
        }

        const resolved = (await i18n.getGuildLocale(guild.id)) ?? 'en-US';
        const t = i18n.getFixedT(resolved, 'moderation');

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(t('welcome.title'))
            .setDescription(
                config.welcome.message
                    .replace('{user}', member.toString())
                    .replace('{server}', guild.name)
            )
            .addFields(
                {
                    name: t('welcome.newMember'),
                    value: member.user.tag,
                    inline: true
                },
                {
                    name: t('welcome.memberId'),
                    value: member.id,
                    inline: true
                },
                {
                    name: t('welcome.joinedAt'),
                    value: new Date().toLocaleString(),
                    inline: true
                }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({
                text: t('welcome.totalMembers', { count: guild.memberCount }),
                iconURL: guild.iconURL() ?? undefined
            })
            .setTimestamp();

        try {
            await (targetChannel as TextChannel).send({
                content: t('welcome.greeting', { user: member.toString() }),
                embeds: [welcomeEmbed]
            });
            console.log(`[SUCCESS] Welcome message sent for ${member.user.tag}`);
        } catch (error) {
            console.warn(`[WARN] Could not send welcome message in #${targetChannel.name} (${targetChannel.id}): ${(error as Error).message}`);
        }
    }
};