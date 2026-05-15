import { EmbedBuilder } from 'discord.js';
import { config } from '../../../config/config.js';
import { logEvent, createMemberJoinEmbed } from '../../../utils/logger.js';
import { getGuildData, getData, updateGuildData } from '../../../utils/db.js';
import { sendModLog } from '../../../utils/modLog.js';
import { checkRaidPattern, handleRaidDetected } from '../../../utils/raidDetection.js';
import { trackMemberChange } from '../../../utils/analyticsCollector.js';

export default {
    name: 'guildMemberAdd',
    once: false,
    async execute(member, client) {
        const { guild } = member;

        // Track member join for analytics
        trackMemberChange(guild.id, true, guild.memberCount);

        // --- Raid Detection ---
        if (!member.user.bot) {
            const isRaid = checkRaidPattern(guild.id, member);
            if (isRaid) {
                await handleRaidDetected(guild, member);
            }
        }

        // --- Blacklist check ---
        if (!member.user.bot) {
            const globalData = await getData('global_blacklist') || { entries: {} };
            const globalEntries = globalData.entries || {};
            let entry = globalEntries[member.id];
            let isGlobal = false;

            if (entry) {
                isGlobal = true;
            } else {
                const guildData = await getGuildData('blacklist', guild.id);
                const entries = guildData.entries || {};
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
                            { name: 'Reason', value: entry.reason, inline: false },
                            { name: 'Blacklisted By', value: entry.moderatorTag, inline: true },
                            { name: 'Server', value: guild.name, inline: true },
                            { name: 'Scope', value: isGlobal ? 'Global (All Servers)' : 'This Server Only', inline: true }
                        )
                        .setFooter({ text: 'If you believe this is a mistake, please contact the server staff.' })
                        .setTimestamp();

                    await member.user.send({ embeds: [dmEmbed] });
                } catch (dmError) {
                    console.log(`[INFO] Could not DM blacklisted user ${member.user.tag}: ${dmError.message}`);
                }

                try {
                    await guild.bans.create(member.id, {
                        reason: `Blacklisted${isGlobal ? ' (Global)' : ''}: ${entry.reason}`
                    });

                    await sendModLog(guild, {
                        action: 'ban',
                        target: member.user,
                        moderator: { tag: entry.moderatorTag, id: entry.moderatorId, displayAvatarURL: () => null },
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

            if (autoRoleConfig && autoRoleConfig.enabled && autoRoleConfig.roleId) {
                const role = guild.roles.cache.get(autoRoleConfig.roleId);

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

            if (rolePersistenceConfig && rolePersistenceConfig.enabled && rolePersistenceConfig.savedRoles) {
                const savedData = rolePersistenceConfig.savedRoles[member.id];

                if (savedData && savedData.roles && savedData.roles.length > 0) {
                    const validRoles = savedData.roles
                        .filter(roleId => guild.roles.cache.has(roleId))
                        .map(roleId => guild.roles.cache.get(roleId));

                    if (validRoles.length > 0) {
                        try {
                            await member.roles.add(validRoles, 'Restoring roles from previous session');
                            console.log(`[SUCCESS] Restored ${validRoles.length} roles for ${member.user.tag}`);

                            await updateGuildData('role-persistence', guild.id, (data) => {
                                if (data.savedRoles) {
                                    delete data.savedRoles[member.id];
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

        const welcomeChannel = guild.channels.cache.find(
            channel => channel.name === config.welcome.channelName
        );

        const canSend = ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages');

        const targetChannel = (welcomeChannel && canSend(welcomeChannel))
            ? welcomeChannel
            : (guild.systemChannel && canSend(guild.systemChannel))
                ? guild.systemChannel
                : guild.channels.cache.find(canSend);

        if (!targetChannel) {
            console.log('[INFO] No suitable channel for welcome message — no text channel with SendMessages permission');
            return;
        }

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Welcome to the Server!')
            .setDescription(
                config.welcome.message
                    .replace('{user}', member.toString())
                    .replace('{server}', guild.name)
            )
            .addFields(
                {
                    name: 'New Member',
                    value: member.user.tag,
                    inline: true
                },
                {
                    name: 'Member ID',
                    value: member.id,
                    inline: true
                },
                {
                    name: 'Joined At',
                    value: new Date().toLocaleString(),
                    inline: true
                }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({
                text: `Total Members: ${guild.memberCount}`,
                iconURL: guild.iconURL()
            })
            .setTimestamp();

        try {
            await targetChannel.send({
                content: `Hey ${member.toString()}!`,
                embeds: [welcomeEmbed]
            });
            console.log(`[SUCCESS] Welcome message sent for ${member.user.tag}`);
        } catch (error) {
            console.error(`[ERROR] Error sending welcome message in #${targetChannel.name} (${targetChannel.id}): ${error.message}`);
        }
    }
};
