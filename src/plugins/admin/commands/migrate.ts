import { config } from '../../../config/config.js';
import { getDb, runMigrations } from '../../../db/knex.js';
import { safeError } from '../../../utils/safeError.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'migrate',
    description: 'Manage database migrations (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    canQueue: false,
    options: [
        {
            name: 'status',
            description: 'Check database migration status',
            type: 1
        },
        {
            name: 'run',
            description: 'Run pending database migrations',
            type: 1
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const denial = await requireOwner(interaction);
            if (denial) {
                if (typeof denial === 'string') {
                    return safeReply(interaction, denial);
                }
                // If denial is an embed object, use a generic message
                return safeReply(interaction, 'Access denied: bot owner only');
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'status') {
                const db = getDb();
                const [completed, pending] = await db.migrate.list();
                const completedNames = completed && completed.length > 0
                    ? completed.map((m: { name?: string; file?: string }) => '`' + (m.name ?? m.file ?? m) + '`').join('\n')
                    : 'None';
                const pendingFiles = pending && pending.length > 0
                    ? pending.map((m: { file?: string }) => '`' + (m.file ?? m) + '`').join('\n')
                    : 'None';

                return safeReply(interaction, `Migration Status (${config.database.type}):\n\nCompleted:\n${completedNames}\n\nPending:\n${pendingFiles}`);
            }

            if (subcommand === 'run') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                try {
                    await runMigrations();
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[SUCCESS] Migrations Applied',
                            description: 'All pending migrations have been run successfully.',
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{ color: 0xFF0000, title: '[ERROR] Migration Failed', description: safeError(err) }]
                    });
                }
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};