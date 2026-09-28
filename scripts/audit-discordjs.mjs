#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

function globSync(pattern) {
  const results = [];
  const base = 'src';

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
  }

  walk(base);
  return results;
}

const patterns = [
  { name: 'GatewayIntentBits', regex: /GatewayIntentBits/g },
  { name: 'Intents.FLAGS', regex: /Intents\.FLAGS/g },
  { name: 'EmbedBuilder', regex: /EmbedBuilder/g },
  { name: 'MessageEmbed', regex: /MessageEmbed/g },
  { name: 'Client constructor', regex: /new Client\(/g },
  { name: 'Client login', regex: /\bclient\.login\(/g },
  { name: 'Interaction reply', regex: /\.reply\(/g },
  { name: 'Interaction deferReply', regex: /\.deferReply\(/g },
  { name: 'Interaction editReply', regex: /\.editReply\(/g },
  { name: 'Interaction followUp', regex: /\.followUp\(/g },
  { name: 'CommandInteraction', regex: /CommandInteraction/g },
  { name: 'ButtonInteraction', regex: /ButtonInteraction/g },
  { name: 'ModalSubmitInteraction', regex: /ModalSubmitInteraction/g },
  { name: 'StringSelectMenuInteraction', regex: /StringSelectMenuInteraction/g },
  { name: 'ChatInputCommandInteraction', regex: /ChatInputCommandInteraction/g },
  { name: 'MessageContextMenuCommandInteraction', regex: /MessageContextMenuCommandInteraction/g },
  { name: 'UserContextMenuCommandInteraction', regex: /UserContextMenuCommandInteraction/g },
  { name: 'PermissionsBitField', regex: /PermissionsBitField/g },
  { name: 'PermissionFlagsBits', regex: /PermissionFlagsBits/g },
  { name: 'ChannelType', regex: /ChannelType/g },
  { name: 'ComponentType', regex: /ComponentType/g },
  { name: 'ButtonStyle', regex: /ButtonStyle/g },
  { name: 'ActionRowBuilder', regex: /ActionRowBuilder/g },
  { name: 'ButtonBuilder', regex: /ButtonBuilder/g },
  { name: 'StringSelectMenuBuilder', regex: /StringSelectMenuBuilder/g },
  { name: 'ModalBuilder', regex: /ModalBuilder/g },
  { name: 'REST', regex: /\bREST\b/g },
  { name: 'Routes', regex: /Routes/g },
  { name: 'Events', regex: /Events/g },
  { name: 'Partials', regex: /Partials/g },
  { name: 'Collection', regex: /Collection/g },
  { name: 'Snowflake', regex: /Snowflake/g },
  { name: 'ApplicationCommandType', regex: /ApplicationCommandType/g },
  { name: 'ApplicationCommandOptionType', regex: /ApplicationCommandOptionType/g },
  { name: 'SlashCommandBuilder', regex: /SlashCommandBuilder/g },
  { name: 'ContextMenuCommandBuilder', regex: /ContextMenuCommandBuilder/g },
  { name: 'MessageFlags', regex: /MessageFlags/g },
  { name: 'ColorResolvable', regex: /ColorResolvable/g },
  { name: 'APIInteractionGuildMember', regex: /APIInteractionGuildMember/g },
  { name: 'Guild', regex: /\bGuild\b/g },
  { name: 'GuildMember', regex: /GuildMember/g },
  { name: 'TextChannel', regex: /TextChannel/g },
  { name: 'VoiceChannel', regex: /VoiceChannel/g },
  { name: 'ThreadChannel', regex: /ThreadChannel/g },
  { name: 'NewsChannel', regex: /NewsChannel/g },
  { name: 'StageChannel', regex: /StageChannel/g },
  { name: 'Role', regex: /\bRole\b/g },
  { name: 'User', regex: /\bUser\b/g },
  { name: 'Message', regex: /\bMessage\b/g },
  { name: 'Interaction', regex: /\bInteraction\b/g },
  { name: 'Attachment', regex: /Attachment/g },
  { name: 'Status', regex: /\bStatus\b/g },
  { name: 'ActivityType', regex: /ActivityType/g },
  { name: 'GatewayDispatchEvents', regex: /GatewayDispatchEvents/g },
  { name: 'ClientEvents', regex: /ClientEvents/g },
  { name: 'Intents', regex: /\bIntents\b/g },
];

const files = globSync('src/**/*.ts');
const results = new Map();

for (const pattern of patterns) {
  results.set(pattern.name, { total: 0, files: new Map() });
}

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const relPath = file.replace(resolve('src') + '/', '');

  for (const pattern of patterns) {
    const matches = content.match(pattern.regex);
    if (matches) {
      const data = results.get(pattern.name);
      data.total += matches.length;
      data.files.set(relPath, (data.files.get(relPath) || 0) + matches.length);
    }
  }
}

let output = '# discord.js v14 → v15 API Audit\n\n';
output += `Generated: ${new Date().toISOString()}\n`;
output += `Files scanned: ${files.length}\n\n`;

output += '| API | Total Occurrences | Files Affected |\n';
output += '|-----|-------------------|----------------|\n';

for (const [name, data] of results) {
  if (data.total > 0) {
    const fileCount = data.files.size;
    output += `| ${name} | ${data.total} | ${fileCount} |\n`;
  }
}

output += '\n---\n\n## Per-File Breakdown\n\n';

for (const [name, data] of results) {
  if (data.total > 0) {
    output += `### ${name} (${data.total} total)\n\n`;
    for (const [file, count] of data.files) {
      output += `- \`${file}\`: ${count}\n`;
    }
    output += '\n';
  }
}

console.log(output);