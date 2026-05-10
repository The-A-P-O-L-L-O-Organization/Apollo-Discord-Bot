import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postNaviWord } from '../utils/naviApi.js';

export default {
  data: new SlashCommandBuilder()
    .setName('navi')
    .setDescription('Manually trigger a Na\'vi word post (owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  name: 'navi',
  canQueue: false,
  category: 'nova',

  async execute(interaction) {
    const ownerIds = (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    if (ownerIds.length > 0 && !ownerIds.includes(interaction.user.id)) {
      return interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const channelId = process.env.NAVI_CHANNEL_ID;
    if (!channelId) {
      return interaction.followUp({ content: 'NAVI_CHANNEL_ID is not configured.', ephemeral: true });
    }

    const success = await postNaviWord(interaction.client, channelId);
    if (success) {
      return interaction.followUp({ content: 'Na\'vi word posted successfully.', ephemeral: true });
    }
    return interaction.followUp({ content: 'Failed to fetch and post the Na\'vi word.', ephemeral: true });
  }
};
