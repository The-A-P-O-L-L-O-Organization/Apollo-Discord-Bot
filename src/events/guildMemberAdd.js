// Guild Member Add Event Handler
// This event fires when a new member joins the server

import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { logEvent, createMemberJoinEmbed } from '../utils/logger.js';
import { getGuildData, getData } from '../utils/db.js';
import { sendModLog } from '../utils/modLog.js';
import { checkRaidPattern, handleRaidDetected } from '../utils/raidDetection.js';
import { trackMemberChange } from '../utils/analyticsCollector.js';

export default async function guildMemberAddHandler(member) {
    const { guild } = member;

    // Track member join for analytics
    trackMemberChange(guild.id, true, guild.memberCount);

    // --- Raid Detection ---
    // Check for raid patterns (before other checks to prevent spam)
    if (!member.user.bot) {
        const isRaid = checkRaidPattern(guild.id, member);
        if (isRaid) {
            await handleRaidDetected(guild, member);
            // Continue with other checks even during raid
        }
    }
    // --- End Raid Detection ---

    // --- Blacklist check ---
    // Skip bots; only check real users
    if (!member.user.bot) {
        // Check global blacklist first
        const globalData = getData('global_blacklist') || { entries: {} };
        const globalEntries = globalData.entries || {};
        let entry = globalEntries[member.id];
        let isGlobal = false;

        if (entry) {
            isGlobal = true;
        } else {
            // Check guild-specific blacklist
            const guildData = getGuildData('blacklist', guild.id);
            const entries = guildData.entries || {};
            entry = entries[member.id];
        }

        if (entry) {
            // Attempt to DM the user before banning so Discord can still deliver it
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

            // Ban the user
            try {
                await guild.bans.create(member.id, {
                    reason: `Blacklisted${isGlobal ? ' (Global)' : ''}: ${entry.reason}`
                });

                // Send mod log
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

            // Stop further processing (skip welcome message)
            return;
        }
    }
    // --- End blacklist check ---

    // --- Auto-role assignment ---
    if (!member.user.bot) {
        const autoRoleConfig = getGuildData('autorole', guild.id);
        
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
        
        // --- Role Persistence: Restore saved roles ---
        const rolePersistenceConfig = getGuildData('role-persistence', guild.id);
        
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
                        
                        // Remove from saved roles after restoration
                        delete rolePersistenceConfig.savedRoles[member.id];
                        setGuildData('role-persistence', guild.id, rolePersistenceConfig);
                    } catch (roleError) {
                        console.error(`[ERROR] Failed to restore roles for ${member.user.tag}:`, roleError);
                    }
                }
            }
        }
        // --- End role persistence ---
    }
    // --- End auto-role assignment ---

    // Log the member join event (if logging is enabled)
    if (!member.user.bot) {
        const logEmbed = createMemberJoinEmbed(member);
        await logEvent(guild, 'memberJoin', logEmbed);
    }
    
    // Find the welcome channel
    const welcomeChannel = guild.channels.cache.find(
        channel => channel.name === config.welcome.channelName
    );
    
    // If no welcome channel found, try to use the system channel or first available channel
    const targetChannel = welcomeChannel || guild.systemChannel || guild.channels.cache.first();
    
    if (!targetChannel) {
        console.log('[ERROR] No suitable channel found for welcome message');
        return;
    }
    
    // Create an embedded welcome message
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green color
        .setTitle('Welcome to the Server!')
        .setDescription(
            config.welcome.message
                .replace('{user}', member.toString()) // Mentions the user
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
    
    // Send the welcome message
    try {
        await targetChannel.send({
            content: `Hey ${member.toString()}!`,
            embeds: [welcomeEmbed]
        });
        console.log(`[SUCCESS] Welcome message sent for ${member.user.tag}`);
    } catch (error) {
        console.error('[ERROR] Error sending welcome message:', error);
    }
}

