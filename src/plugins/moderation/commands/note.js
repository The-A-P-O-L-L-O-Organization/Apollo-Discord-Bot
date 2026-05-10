// Note Command
// Add internal mod notes on users (not visible to the user)

import { PermissionsBitField } from 'discord.js';
import { getUserData, setUserData, appendToUserArray } from '../../../utils/db.js';
import { generateId } from '../../../utils/db.js';

export default {
    name: 'note',
    description: 'Manage internal moderator notes on users',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'add',
            description: 'Add a note to a user',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to add a note for',
                    type: 6, // USER type
                    required: true
                },
                {
                    name: 'note',
                    description: 'The note content',
                    type: 3, // STRING type
                    required: true,
                    max_length: 1024
                }
            ]
        },
        {
            name: 'view',
            description: 'View notes for a user',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user to view notes for',
                    type: 6, // USER type
                    required: true
                }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a note by ID',
            type: 1, // SUB_COMMAND
            options: [
                {
                    name: 'user',
                    description: 'The user whose note to remove',
                    type: 6, // USER type
                    required: true
                },
                {
                    name: 'note-id',
                    description: 'The ID of the note to remove',
                    type: 3, // STRING type
                    required: true
                }
            ]
        }
    ],
    
    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const user = interaction.options.getUser('user');
            
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (subcommand === 'add') {
                await handleAddNote(interaction, user);
            } else if (subcommand === 'view') {
                await handleViewNotes(interaction, user);
            } else if (subcommand === 'remove') {
                await handleRemoveNote(interaction, user);
            }
            
        } catch (error) {
            console.error('[ERROR] Note command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while managing notes.',
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
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};

async function handleAddNote(interaction, user) {
    const noteContent = interaction.options.getString('note');
    
    // Create note object
    const note = {
        id: generateId(),
        userId: user.id,
        userTag: user.tag,
        note: noteContent,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        timestamp: Date.now()
    };
    
    // Add note to database
    await appendToUserArray('mod-notes', interaction.guild.id, user.id, note);
    
    // Create success embed
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Note Added',
        description: `Note has been added for ${user.tag}.`,
        fields: [
            {
                name: '[INFO] Note ID',
                value: note.id,
                inline: true
            },
            {
                name: '[INFO] Moderator',
                value: interaction.user.tag,
                inline: true
            },
            {
                name: '[INFO] Note',
                value: noteContent,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    
    // Log the action
    console.log(`[MODERATION] Note added for user ${user.tag} by ${interaction.user.tag}. Note ID: ${note.id}`);
}

async function handleViewNotes(interaction, user) {
    // Get notes for user
    const notes = await getUserData('mod-notes', interaction.guild.id, user.id) || [];
    
    if (notes.length === 0) {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[INFO] No Notes Found',
            description: `No notes found for ${user.tag}.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    // Sort notes by timestamp (newest first)
    notes.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create embed with notes
    const notesEmbed = {
        color: 0x0099FF,
        title: `[NOTES] Moderator Notes for ${user.tag}`,
        description: `Total notes: ${notes.length}`,
        fields: notes.slice(0, 10).map(note => ({
            name: `Note ID: ${note.id}`,
            value: `**By:** ${note.moderatorTag}\n**Date:** <t:${Math.floor(note.timestamp / 1000)}:R>\n**Note:** ${note.note}`,
            inline: false
        })),
        footer: {
            text: notes.length > 10 ? `Showing 10 of ${notes.length} notes` : `Total: ${notes.length} note(s)`
        },
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [notesEmbed], ephemeral: true });
}

async function handleRemoveNote(interaction, user) {
    const noteId = interaction.options.getString('note-id');
    
    // Get notes for user
    const notes = await getUserData('mod-notes', interaction.guild.id, user.id) || [];
    
    // Find note
    const noteIndex = notes.findIndex(n => n.id === noteId);
    
    if (noteIndex === -1) {
        const errorEmbed = {
            color: 0xFF0000,
            title: '[ERROR] Note Not Found',
            description: `No note with ID \`${noteId}\` found for ${user.tag}.`,
            timestamp: new Date().toISOString()
        };
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    // Remove note
    const removedNote = notes.splice(noteIndex, 1)[0];
    await setUserData('mod-notes', interaction.guild.id, user.id, notes);
    
    // Create success embed
    const successEmbed = {
        color: 0x00FF00,
        title: '[SUCCESS] Note Removed',
        description: `Note has been removed for ${user.tag}.`,
        fields: [
            {
                name: '[INFO] Note ID',
                value: removedNote.id,
                inline: true
            },
            {
                name: '[INFO] Original Moderator',
                value: removedNote.moderatorTag,
                inline: true
            },
            {
                name: '[INFO] Removed By',
                value: interaction.user.tag,
                inline: true
            },
            {
                name: '[INFO] Note Content',
                value: removedNote.note,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };
    
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
    
    // Log the action
    console.log(`[MODERATION] Note ${noteId} removed for user ${user.tag} by ${interaction.user.tag}`);
}
