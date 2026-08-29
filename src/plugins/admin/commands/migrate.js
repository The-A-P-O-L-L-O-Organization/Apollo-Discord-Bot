import { config } from '../../../config/config.js';
import { getDb, runMigrations } from '../../../db/knex.js';
import { safeError } from '../../../utils/safeError.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
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
      type: 1,
    },
    {
      name: 'run',
      description: 'Run pending database migrations',
      type: 1,
    },
  ],

async execute(interaction) {
    try {

     try {
       const denial = await requireOwner(interaction);
       if (denial) {
         return safeReply(interaction, denial);
       }

       const subcommand = interaction.options.getSubcommand();

       if (subcommand === 'status') {
         try {
           const db = getDb();
           const [completed, pending] = await db.migrate.list();
           const completedNames = completed && completed.length > 0
             ? completed.map(m => '`' + (m.name || m.file || m) + '`').join('\n')
             : 'None';
           const pendingFiles = pending && pending.length > 0
             ? pending.map(m => '`' + (m.file || m) + '`').join('\n')
             : 'None';

           return safeReply(interaction, {
             embeds: [{
               color: pending && pending.length > 0 ? 0xFFA500 : 0x00FF00,
               title: 'Migration Status (' + config.database.type + ')',
               fields: [
                 { name: 'Completed', value: completedNames, inline: false },
                 { name: 'Pending', value: pendingFiles, inline: false },
               ],
               timestamp: new Date().toISOString()
             }],
             flags: MessageFlags.Ephemeral
           });
         } catch (err) {
           return safeReply(interaction, {
             embeds: [{ color: 0xFF0000, title: '[ERROR] Migration Status Failed', description: safeError(err) }],
             flags: MessageFlags.Ephemeral
           });
         }
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
       const userMessage = handleDiscordError(error);
       if (userMessage) {
         await safeReply(interaction, userMessage);
       }
     }
   
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}
