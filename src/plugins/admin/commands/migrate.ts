import { config } from '../../../config/config.js';
import { getDb, runMigrations } from '../../../db/knex.js';
import { safeError } from '../../../utils/safeError.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
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
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'admin');
            const denial = await requireOwner(interaction);
            if (denial) {
                if (typeof denial === 'string') {
                    return safeReply(interaction, denial);
                }
                // If denial is an embed object, use a generic message
                return safeReply(interaction, t('migrate.accessDenied'));
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'status') {
                const db = getDb();
                const [completed, pending] = await db.migrate.list();
                const completedNames = completed && completed.length > 0
                    ? completed.map((m: { name?: string; file?: string }) => '`' + (m.name ?? m.file ?? JSON.stringify(m)) + '`').join('\n')
                    : t('migrate.none');
                const pendingFiles = pending && pending.length > 0
                    ? pending.map((m: { file?: string }) => '`' + (m.file ?? JSON.stringify(m)) + '`').join('\n')
                    : t('migrate.none');

                return safeReply(interaction, t('migrate.status', { db: config.database.type, completed: completedNames, pending: pendingFiles }));
            }

            if (subcommand === 'run') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                try {
                    await runMigrations();
                    return interaction.editReply({
                        embeds: [{
                            color: 0x00FF00,
                            title: t('migrate.appliedTitle'),
                            description: t('migrate.appliedDescription'),
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (err) {
                    return interaction.editReply({
                        embeds: [{ color: 0xFF0000, title: t('migrate.failedTitle'), description: safeError(err) }]
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