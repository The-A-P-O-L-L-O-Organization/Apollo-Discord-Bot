// Note Command - Manage internal moderator notes on users
import type { ChatInputCommandInteraction, User } from 'discord.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getUserData, setUserData, appendToUserArray } from '../../../utils/db.js';
import { generateId } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface ModNote {
    id: string;
    userId: string;
    userTag: string;
    note: string;
    moderatorId: string;
    moderatorTag: string;
    timestamp: number;
}

export default {
    name: 'note',
    description: 'Manage internal moderator notes on users',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
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

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const subcommand = interaction.options.getSubcommand();
            const user = interaction.options.getUser('user');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('note.missingUserTitle'),
                    description: t('note.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (subcommand === 'add') {
                await handleAddNote(interaction, user);
            } else if (subcommand === 'view') {
                await handleViewNotes(interaction, user);
            } else if (subcommand === 'remove') {
                await handleRemoveNote(interaction, user);
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('note.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};

async function handleAddNote(interaction: ChatInputCommandInteraction, user: User) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const noteContent = interaction.options.getString('note');

    const note: ModNote = {
        id: generateId(),
        userId: user.id,
        userTag: user.tag,
        note: noteContent!,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        timestamp: Date.now()
    };

    await appendToUserArray('mod-notes', interaction.guild!.id, user.id, note);

    const successEmbed = {
        color: 0x00FF00,
        title: t('note.successNoteAdded'),
        description: t('note.noteHasBeenAddedFor', { user: user.tag }),
        fields: [
            {
                name: t('note.infoNoteId'),
                value: note.id,
                inline: true
            },
            {
                name: t('note.fieldModerator'),
                value: interaction.user.tag,
                inline: true
            },
            {
                name: t('note.infoNote'),
                value: noteContent!,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

    logger.info({ msg: `[MODERATION] Note added for user ${user.tag} by ${interaction.user.tag}. Note ID: ${note.id}` });
}

async function handleViewNotes(interaction: ChatInputCommandInteraction, user: User) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const notes = (await getUserData('mod-notes', interaction.guild!.id, user.id) ?? []) as ModNote[];

    if (notes.length === 0) {
        const errorEmbed = {
            color: 0xFF0000,
            title: t('note.infoNoNotesFound'),
            description: t('note.noNotesFoundForUser', { user: user.tag }),
            timestamp: new Date().toISOString()
        };
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    notes.sort((a, b) => b.timestamp - a.timestamp);

    const notesEmbed = {
        color: 0x0099FF,
        title: t('note.notesModeratorNotesForUser', { user: user.tag }),
        description: t('note.totalNotesCount', { count: notes.length }),
        fields: notes.slice(0, 10).map(note => ({
            name: t('note.noteIdNoteid', { noteId: note.id }),
            value: t('note.byModeratorNDateT', { moderator: note.moderatorTag, value: Math.floor(note.timestamp / 1000), value2: note.note }),
            inline: false
        })),
        footer: {
            text: notes.length > 10 ? `Showing 10 of ${notes.length} notes` : `Total: ${notes.length} note(s)`
        },
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [notesEmbed], flags: MessageFlags.Ephemeral });
}

async function handleRemoveNote(interaction: ChatInputCommandInteraction, user: User) {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
    const t = i18n.getFixedT(resolved, 'moderation');
    const noteId = interaction.options.getString('note-id');

    const notes = (await getUserData('mod-notes', interaction.guild!.id, user.id) ?? []) as ModNote[];

    const noteIndex = notes.findIndex(n => n.id === noteId);

    if (noteIndex === -1) {
        const errorEmbed = {
            color: 0xFF0000,
            title: t('note.errorNoteNotFound'),
            description: `No note with ID \`${noteId}\` found for ${user.tag}.`,
            timestamp: new Date().toISOString()
        };
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        return;
    }

    const removedNote = notes.splice(noteIndex, 1)[0]!;
    await setUserData('mod-notes', interaction.guild!.id, user.id, notes);

    const successEmbed = {
        color: 0x00FF00,
        title: t('note.successNoteRemoved'),
        description: t('note.noteHasBeenRemovedFor', { user: user.tag }),
        fields: [
            {
                name: t('note.infoNoteId2'),
                value: removedNote.id,
                inline: true
            },
            {
                name: t('note.infoOriginalModerator'),
                value: removedNote.moderatorTag,
                inline: true
            },
            {
                name: t('note.infoRemovedBy'),
                value: interaction.user.tag,
                inline: true
            },
            {
                name: t('note.infoNoteContent'),
                value: removedNote.note,
                inline: false
            }
        ],
        timestamp: new Date().toISOString()
    };

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

    logger.info({ msg: `[MODERATION] Note ${noteId} removed for user ${user.tag} by ${interaction.user.tag}` });
}