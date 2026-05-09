import { registerHandler } from '../jobHandler.js';

export const JobNames = {
  PROCESS_COMMAND: 'process-command',
};

export default function register() {
  registerHandler(JobNames.PROCESS_COMMAND, async (job) => {
    const { commandName, guildId, userId, interactionToken, options } = job.data;
    console.log(`[Worker] Processing command: /${commandName} in guild ${guildId}`);
    return { status: 'acknowledged', commandName };
  });
}
