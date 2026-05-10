import { registerHandler } from '../jobHandler.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import { config } from '../../config/config.js';

export const JobNames = {
  PROCESS_COMMAND: 'process-command',
};

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

export default function register() {
  registerHandler(JobNames.PROCESS_COMMAND, async (job) => {
    const { commandName, guildId, interactionToken } = job.data;

    console.log(`[Worker] Executing /${commandName} in guild ${guildId}`);

    if (interactionToken) {
      await rest.post(Routes.interactionCallback(interactionToken), {
        body: { type: 5 },
      });
    }

    const result = { status: 'completed', commandName };

    if (interactionToken) {
      await rest.post(Routes.webhook(config.CLIENT_ID, interactionToken), {
        body: { content: `✅ \`/${commandName}\` executed by worker` },
      });
    }

    return result;
  });
}
