import { config } from '../../../config/config.js';
import { getQueueMetrics } from '../../../queue/metrics.js';
import { requireOwner } from '../../../utils/accessControl.js';

export default {
    name: 'queue',
    description: 'Display BullMQ queue statistics and status (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    canQueue: false,
    options: [],

  async execute(interaction) {
    const denial = await requireOwner(interaction);
    if (denial) {
      return interaction.reply(denial);
    }

    if (!config.queue.enabled) {
      return interaction.reply({
        embeds: [{
          color: 0xFFA500,
          title: 'Queue Not Enabled',
          description: 'Set `QUEUE_ENABLED=true` and configure `REDIS_HOST`/`REDIS_PORT` to enable the work queue.',
          timestamp: new Date().toISOString()
        }],
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const metrics = await getQueueMetrics(config.queue);

    const color = metrics.failed > 0 ? 0xFFA500 : metrics.waiting > 0 ? 0x00FF00 : 0x1E90FF;

    return interaction.editReply({
      embeds: [{
        color,
        title: 'Queue Status (' + config.queue.prefix + ')',
        fields: [
          { name: 'Waiting', value: String(metrics.waiting), inline: true },
          { name: 'Active', value: String(metrics.active), inline: true },
          { name: 'Failed', value: String(metrics.failed), inline: true },
          { name: 'Redis', value: config.queue.redis.host + ':' + config.queue.redis.port, inline: false },
        ],
        timestamp: new Date().toISOString()
      }]
    });
  }
};
