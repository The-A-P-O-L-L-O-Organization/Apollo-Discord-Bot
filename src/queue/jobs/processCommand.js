import { REST } from '@discordjs/rest';
import { Collection } from 'discord.js';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { config } from '../../config/config.js';
import RemoteInteraction from '../remoteInteraction.js';
import { serializeInteraction } from '../serializeInteraction.js';
import { registerHandler } from '../jobHandler.js';
import { createQueue } from '../queue.js';
import { recordCommand, recordCommandDuration, recordError } from '../../utils/metrics.js';

export const JobNames = {
  PROCESS_COMMAND: 'process-command',
};

let rest = null;

// Command module cache to avoid re-importing on every job
export const commandModuleCache = new Map();

function getRest() {
  if (!rest) {
    rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  }
  return rest;
}

export async function enqueueCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return null;

  const data = serializeInteraction(interaction);
  data.pluginId = command.pluginId || null;

  const queue = await createQueue(config.queue.prefix);
  const job = await queue.add(JobNames.PROCESS_COMMAND, data, {
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });

  return job;
}

export default function register() {
  registerHandler(JobNames.PROCESS_COMMAND, async (job) => {
    const data = job.data;
    console.log(`[Worker] Processing /${data.commandName} in guild ${data.guildId}`);

    const r = getRest();

    const interaction = new RemoteInteraction(data, r, {
      commands: new Collection(),
      config: {
        ...config,
        CLIENT_ID: config.CLIENT_ID,
      },
    });

    const startTime = Date.now();
    try {
      const commandModule = await importCommandModule(data.commandName, data.pluginId);
      if (!commandModule) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: 'Error',
            description: `Command \`/${data.commandName}\` not found on worker.`,
          }],
        });
        recordCommand(data.commandName, data.guildId, 'not_found');
        return { status: 'error', reason: 'command_not_found' };
      }

      if (typeof commandModule.execute !== 'function') {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: 'Error',
            description: `Command \`/${data.commandName}\` has invalid execute method.`,
          }],
        });
        recordCommand(data.commandName, data.guildId, 'invalid');
        return { status: 'error', reason: 'invalid_command' };
      }

      await commandModule.execute(interaction);

      console.log(`[Worker] /${data.commandName} completed`);
      recordCommand(data.commandName, data.guildId, 'success');
      recordCommandDuration(data.commandName, Date.now() - startTime);
      return { status: 'completed', commandName: data.commandName };
    } catch (error) {
      console.error(`[Worker] Error executing /${data.commandName}:`, error.message);

      const errorEmbed = {
        color: 0xFF0000,
        title: 'Error',
        description: 'An error occurred while executing this command.',
        fields: [{ name: 'Error', value: error.message || 'Unknown error' }],
        timestamp: new Date().toISOString(),
      };

      try {
        await interaction.editReply({ embeds: [errorEmbed] });
      } catch (e) {
        console.error('[Worker] Failed to send error response:', e.message);
      }

      recordCommand(data.commandName, data.guildId, 'error');
      recordError('command_execution', data.commandName);
      return { status: 'error', error: error.message };
    }
  });
}

async function importCommandModule(commandName, pluginId) {
  const cacheKey = `${pluginId || 'global'}:${commandName}`;
  if (commandModuleCache.has(cacheKey)) {
    return commandModuleCache.get(cacheKey);
  }

  const cwd = process.cwd();
  const baseDirs = [
    pluginId ? path.join(cwd, 'src/plugins', pluginId) : null,
    pluginId ? path.join(cwd, 'data/plugins', pluginId) : null,
  ].filter(Boolean);

  for (const baseDir of baseDirs) {
    const cmdPath = path.join(baseDir, 'commands', `${commandName}.js`);
    if (existsSync(cmdPath)) {
      try {
        const url = pathToFileURL(cmdPath);
        // Remove cache-busting in production
        if (process.env.NODE_ENV === 'development') {
          url.searchParams.set('t', Date.now().toString());
        }
        const mod = await import(url.href);
        if (mod?.default?.execute) {
          commandModuleCache.set(cacheKey, mod.default);
          return mod.default;
        }
      } catch (err) {
        console.error(`[Worker] Failed to import ${cmdPath}:`, err.message);
      }
    }
  }

  const srcPlugins = path.join(cwd, 'src/plugins');
  try {
    const { readdirSync } = await import('fs');
    const entries = readdirSync(srcPlugins);
    for (const entry of entries) {
      const cmdPath = path.join(srcPlugins, entry, 'commands', `${commandName}.js`);
      if (existsSync(cmdPath)) {
        try {
          const url = pathToFileURL(cmdPath);
          if (process.env.NODE_ENV === 'development') {
            url.searchParams.set('t', Date.now().toString());
          }
          const mod = await import(url.href);
          if (mod?.default?.execute) {
            commandModuleCache.set(cacheKey, mod.default);
            return mod.default;
          }
        } catch {}
      }
    }
  } catch {}

  return null;
}
