const fs = require('fs');
const path = require('path');

const baseDir = process.cwd();
const pluginsDir = path.join(baseDir, 'src', 'plugins');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js') && fullPath.includes('/commands/')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const importLine = "import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';";
  if (!content.includes(importLine)) {
    // Add after last import
    const lines = content.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import')) lastImport = i;
    }
    if (lastImport !== -1) {
      lines.splice(lastImport + 1, 0, importLine);
    } else {
      lines.unshift(importLine);
    }
    content = lines.join('\n');
  }

  // Wrap execute
  const asyncExec = /async\s+execute\s*\(\s*interaction\s*\)\s*{/;
  const match = content.search(asyncExec);
  if (match !== -1) {
    let bracePos = match;
    while (bracePos < content.length && content[bracePos] !== '{') bracePos++;
    if (bracePos < content.length) {
      let braceCount = 1, i = bracePos + 1;
      while (i < content.length && braceCount > 0) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        i++;
      }
      if (braceCount === 0) {
        const functionBody = content.slice(bracePos + 1, i - 1);
        const newBody = `async execute(interaction) {\n  try {\n${functionBody}\n  } catch (error) {\n    const errorMessage = handleDiscordError(error);\n    if (interaction.replied || interaction.deferred) {\n      await safeFollowUp(interaction, errorMessage);\n    } else {\n      await safeReply(interaction, errorMessage);\n    }\n  }\n}`;
        content = content.slice(0, match) + newBody + content.slice(i);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
        return;
      }
    }
  }
  // Try arrow function
  const arrowExec = /execute\s*:\s*async\s*\(\s*interaction\s*\)\s*=>\s*{/;
  const match2 = content.search(arrowExec);
  if (match2 !== -1) {
    let bracePos = match2;
    while (bracePos < content.length && content[bracePos] !== '{') bracePos++;
    if (bracePos < content.length) {
      let braceCount = 1, i = bracePos + 1;
      while (i < content.length && braceCount > 0) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') braceCount--;
        i++;
      }
      if (braceCount === 0) {
        const functionBody = content.slice(bracePos + 1, i - 1);
        const newBody = `execute: async (interaction) => {\n  try {\n${functionBody}\n  } catch (error) {\n    const errorMessage = handleDiscordError(error);\n    if (interaction.replied || interaction.deferred) {\n      await safeFollowUp(interaction, errorMessage);\n    } else {\n      await safeReply(interaction, errorMessage);\n    }\n  }\n}`;
        content = content.slice(0, match2) + newBody + content.slice(i);
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
        return;
      }
    }
  }
  console.log(`No change ${filePath}`);
}

walk(pluginsDir);
