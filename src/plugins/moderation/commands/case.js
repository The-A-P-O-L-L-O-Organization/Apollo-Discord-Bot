// Case Command
// Professional mod tracking with case IDs for all moderation actions

import { PermissionsBitField } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    name: 'case',
    description: 'Manage moderation cases',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'view',
            description: 'View a specific case by ID',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'case-id',
                    description: 'The case ID to view',
                    type: 4, // INTEGER type
                    required: true,
                    min_value: 1
                }
            ]
        },
        {
            name: 'search',
            description: 'Search cases for a user',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to search cases for',
                    type: 6, // USER type
                    required: true
                },
                {
                    name: 'type',
                    description: 'Filter by case type',
                    type: 3, // STRING type
                    required: false,
                    choices: [
                        { name: 'Ban', value: 'ban' },
                        { name: 'Kick', value: 'kick' },
                        { name: 'Mute', value: 'mute' },
                        { name: 'Warn', value: 'warn' },
                        { name: 'Tempban', value: 'tempban' },
                        { name: 'Unmute', value: 'unmute' },
                        { name: 'Unban', value: 'unban' }
                    ]
                }
            ]
        },
        {
            name: 'edit',
            description: 'Edit a case reason',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'case-id',
                    description: 'The case ID to edit',
                    type: 4, // INTEGER type
                    required: true,
                    min_value: 1
                },
                {
                    name: 'reason',
                    description: 'The new reason',
                    type: 3, // STRING type
                    required: true,
                    max_length: 512
                }
            ]
        },
        {
            name: 'delete',
            description: 'Delete a case (mark as inactive)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'case-id',
                    description: 'The case ID to delete',
                    type: 4, // INTEGER type
                    required: true,
                    min_value: 1
                },
                {
                    name: 'reason',
                    description: 'Reason for deleting the case',
                    type: 3, // STRING type
                    required: true
                }
            ]
        },
        {
            name: 'list',
            description: 'List recent cases',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'limit',
                    description: 'Number of cases to show (default: 10)',
                    type: 4, // INTEGER type
                    required: false,
                    min_value: 1,
                    max_value: 25
                }
            ]
        }
    ],
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'view') {
                await handleViewCase(interaction);
            } else if (subcommand === 'search') {
                await handleSearchCases(interaction);
            } else if (subcommand === 'edit') {
                await handleEditCase(interaction);
            } else if (subcommand === 'delete') {
                await handleDeleteCase(interaction);
            } else if (subcommand === 'list') {
                await handleListCases(interaction);
            }
            
        } catch (error) {
            console.error('[ERROR] Case command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while managing cases.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
        }
    }
};

async function handleViewCase(interaction) {
    const caseId = interaction.options.getInteger('case-id');
    
    // Get case data
    const caseData = await getGuildData('mod-cases', interaction.guild.id);
    const cases = caseData.cases || [];
    const caseInfo = cases.find(c => c.caseId === caseId);
    
    if (!caseInfo) {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Case Not Found',
            description: `No case with ID #${caseId} found.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    // Get action colors
    const actionColors = {
        kick: 0xFFA500,
        ban: 0xFF0000,
        tempban: 0xFF0000,
        unban: 0x00FF00,
        mute: 0xFFFF00,
        unmute: 0x00FF00,
        warn: 0xFFFF00,
        default: 0x0099FF
    };
    
    // Create case embed
    const caseEmbed = {
        color: actionColors[caseInfo.type.toLowerCase()] || actionColors.default,
        title: `[CASE] Case #${caseInfo.caseId} - ${caseInfo.type.toUpperCase()}`,
        fields: [
            {
                name: '[INFO] Target User',
                value: `${caseInfo.targetTag}\n\`${caseInfo.targetId}\``,
                inline: true
            },
            {
                name: '[INFO] Moderator',
                value: `${caseInfo.moderatorTag}\n\`${caseInfo.moderatorId}\``,
                inline: true
            },
            {
                name: '[INFO] Status',
                value: caseInfo.active ? '✅ Active' : '❌ Deleted',
                inline: true
            },
            {
                name: '[INFO] Reason',
                value: caseInfo.reason,
                inline: false
            },
            {
                name: '[INFO] Date',
                value: `<t:${Math.floor(caseInfo.timestamp / 1000)}:F>`,
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    // Add duration if present
    if (caseInfo.duration) {
        caseEmbed.fields.splice(3, 0, {
            name: '[INFO] Duration',
            value: caseInfo.duration,
            inline: true
        });
    }
    
    // Add edited info if present
    if (caseInfo.editedBy) {
        caseEmbed.fields.push({
            name: '[INFO] Last Edited',
            value: `By: ${caseInfo.editedByTag}\nAt: <t:${Math.floor(caseInfo.editedAt / 1000)}:R>`,
            inline: false
        });
    }
    
    await interaction.reply({ embeds: [caseEmbed], flags: 64 });
}

async function handleSearchCases(interaction) {
    const user = interaction.options.getUser('user');
    const typeFilter = interaction.options.getString('type');
    
    // Get case data
    const caseData = await getGuildData('mod-cases', interaction.guild.id);
    const cases = caseData.cases || [];
    
    // Filter cases for user
    let userCases = cases.filter(c => c.targetId === user.id && c.active);
    
    // Apply type filter if specified
    if (typeFilter) {
        userCases = userCases.filter(c => c.type.toLowerCase() === typeFilter.toLowerCase());
    }
    
    if (userCases.length === 0) {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[INFO] No Cases Found',
            description: `No ${typeFilter ? typeFilter + ' ' : ''}cases found for ${user.tag}.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    // Sort by newest first
    userCases.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create embed
    const casesEmbed = {
        color: 0x0099FF,
        title: `[CASES] Cases for ${user.tag}`,
        description: `Total ${typeFilter ? typeFilter + ' ' : ''}cases: ${userCases.length}`,
        fields: userCases.slice(0, 10).map(c => ({
            name: `Case #${c.caseId} - ${c.type.toUpperCase()}`,
            value: `**Moderator:** ${c.moderatorTag}\n**Date:** <t:${Math.floor(c.timestamp / 1000)}:R>\n**Reason:** ${c.reason.substring(0, 100)}${c.reason.length > 100 ? '...' : ''}`,
            inline: false
        })),
        footer: {
            text: userCases.length > 10 ? `Showing 10 of ${userCases.length} cases` : `Total: ${userCases.length} case(s)`
        },
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [casesEmbed], flags: 64 });
}

async function handleEditCase(interaction) {
    const caseId = interaction.options.getInteger('case-id');
    const newReason = interaction.options.getString('reason');
    
    // Get and update case data
    const result = await updateGuildData('mod-cases', interaction.guild.id, data => {
        const cases = data.cases || [];
        const caseInfo = cases.find(c => c.caseId === caseId);
        
        if (!caseInfo) {
            return { ...data, error: 'not_found' };
        }
        
        if (!caseInfo.active) {
            return { ...data, error: 'deleted' };
        }
        
        // Store old reason
        const oldReason = caseInfo.reason;
        
        // Update case
        caseInfo.reason = newReason;
        caseInfo.editedBy = interaction.user.id;
        caseInfo.editedByTag = interaction.user.tag;
        caseInfo.editedAt = Date.now();
        caseInfo.oldReason = oldReason;
        
        return data;
    });
    
    if (result.error === 'not_found') {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Case Not Found',
            description: `No case with ID #${caseId} found.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    if (result.error === 'deleted') {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Case Deleted',
            description: `Case #${caseId} has been deleted and cannot be edited.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    // Create success embed
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Case Updated',
        description: `Case #${caseId} has been updated.`,
        fields: [
            {
                name: '[INFO] Edited By',
                value: interaction.user.tag,
                inline: true
            },
            {
                name: '[INFO] Case ID',
                value: `#${caseId}`,
                inline: true
            },
            {
                name: '[INFO] New Reason',
                value: newReason,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: 64 });
    
    // Log the action
    console.log(`[MODERATION] Case #${caseId} edited by ${interaction.user.tag}`);
}

async function handleDeleteCase(interaction) {
    const caseId = interaction.options.getInteger('case-id');
    const reason = interaction.options.getString('reason');
    
    // Get and update case data
    const result = await updateGuildData('mod-cases', interaction.guild.id, data => {
        const cases = data.cases || [];
        const caseInfo = cases.find(c => c.caseId === caseId);
        
        if (!caseInfo) {
            return { ...data, error: 'not_found' };
        }
        
        if (!caseInfo.active) {
            return { ...data, error: 'already_deleted' };
        }
        
        // Mark as inactive
        caseInfo.active = false;
        caseInfo.deletedBy = interaction.user.id;
        caseInfo.deletedByTag = interaction.user.tag;
        caseInfo.deletedAt = Date.now();
        caseInfo.deleteReason = reason;
        
        return data;
    });
    
    if (result.error === 'not_found') {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Case Not Found',
            description: `No case with ID #${caseId} found.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    if (result.error === 'already_deleted') {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Already Deleted',
            description: `Case #${caseId} has already been deleted.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    // Create success embed
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Case Deleted',
        description: `Case #${caseId} has been marked as deleted.`,
        fields: [
            {
                name: '[INFO] Deleted By',
                value: interaction.user.tag,
                inline: true
            },
            {
                name: '[INFO] Case ID',
                value: `#${caseId}`,
                inline: true
            },
            {
                name: '[INFO] Reason',
                value: reason,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], flags: 64 });
    
    // Log the action
    console.log(`[MODERATION] Case #${caseId} deleted by ${interaction.user.tag}. Reason: ${reason}`);
}

async function handleListCases(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Get case data
    const caseData = await getGuildData('mod-cases', interaction.guild.id);
    const cases = caseData.cases || [];
    
    // Filter active cases
    const activeCases = cases.filter(c => c.active);
    
    if (activeCases.length === 0) {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[INFO] No Cases Found',
            description: 'No active cases found for this server.',
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    
    // Sort by newest first
    activeCases.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create embed
    const casesEmbed = {
        color: 0x0099FF,
        title: '[CASES] Recent Moderation Cases',
        description: `Total active cases: ${activeCases.length}`,
        fields: activeCases.slice(0, limit).map(c => ({
            name: `Case #${c.caseId} - ${c.type.toUpperCase()}`,
            value: `**Target:** ${c.targetTag}\n**Moderator:** ${c.moderatorTag}\n**Date:** <t:${Math.floor(c.timestamp / 1000)}:R>\n**Reason:** ${c.reason.substring(0, 80)}${c.reason.length > 80 ? '...' : ''}`,
            inline: false
        })),
        footer: {
            text: activeCases.length > limit ? `Showing ${limit} of ${activeCases.length} cases` : `Total: ${activeCases.length} case(s)`
        },
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [casesEmbed], flags: 64 });
}

/**
 * Creates a new moderation case
 * @param {string} guildId - The guild ID
 * @param {Object} caseInfo - Case information
 * @returns {number} The case ID
 */
export async function createModCase(guildId, caseInfo) {
    const data = await updateGuildData('mod-cases', guildId, current => {
        if (!current.cases) {current.cases = [];}
        if (!current.nextCaseId) {current.nextCaseId = 1;}
        
        const caseId = current.nextCaseId++;
        
        current.cases.push({
            caseId,
            type: caseInfo.type,
            targetId: caseInfo.targetId,
            targetTag: caseInfo.targetTag,
            moderatorId: caseInfo.moderatorId,
            moderatorTag: caseInfo.moderatorTag,
            reason: caseInfo.reason,
            duration: caseInfo.duration || null,
            timestamp: Date.now(),
            active: true
        });
        
        return current;
    });
    
    return data.nextCaseId - 1;
}
