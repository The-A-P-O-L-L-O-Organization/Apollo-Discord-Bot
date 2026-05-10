import { config } from '../../../config/config.js';
import { getDb, runMigrations } from '../../../db/knex.js';

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
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    if (ownerIds.length > 0 && !ownerIds.includes(interaction.user.id)) {
      return interaction.reply({
        embeds: [{ color: 0xFF0000, title: '[ERROR] Access Denied', description: 'Only bot owners can use this command.', timestamp: new Date().toISOString() }],
        ephemeral: true
      });
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

        return interaction.reply({
          embeds: [{
            color: pending && pending.length > 0 ? 0xFFA500 : 0x00FF00,
            title: 'Migration Status (' + config.database.type + ')',
            fields: [
              { name: 'Completed', value: completedNames, inline: false },
              { name: 'Pending', value: pendingFiles, inline: false },
            ],
            timestamp: new Date().toISOString()
          }],
          ephemeral: true
        });
      } catch (err) {
        return interaction.reply({
          embeds: [{ color: 0xFF0000, title: '[ERROR] Migration Status Failed', description: err.message }],
          ephemeral: true
        });
      }
    }

    if (subcommand === 'run') {
      await interaction.deferReply({ ephemeral: true });

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
          embeds: [{ color: 0xFF0000, title: '[ERROR] Migration Failed', description: err.message }]
        });
      }
    }
  }
};
