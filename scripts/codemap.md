# scripts/

## Responsibility
Contains utility scripts for bot maintenance and deployment:
- `deploy-commands.js`: Registers application slash commands with Discord (guild or global)
- `generate-manifest.mjs`: Creates plugin-manifest.json with SHA-256 hashes of source files for integrity verification

## Design
- Both scripts are standalone Node.js ES modules executed via `node` command
- Use dotenv for environment variable loading
- Leverage Discord.js REST API for command deployment
- Use Node.js built-in crypto, fs, path utilities for file hashing
- Follow functional programming style with clear separation of concerns (argument parsing, loading, validation, execution)
- Error handling with explicit exit codes for CI/CD integration
- Logger utility imported from src/utils/logger.js for consistent output

## Flow
### deploy-commands.js
1. Parse CLI arguments (--guild, --global, --dry-run, --clear, --json, --help)
2. Load environment variables via dotenv
3. Validate required DISCORD_TOKEN and CLIENT_ID configuration
4. Recursively scan src/plugins/*/commands/ for command files
5. Import each command module and extract SlashCommandBuilder data
6. Validate loaded commands (check descriptions, duplicates, option types)
7. If --clear: delete existing commands (guild or global)
8. If not --dry-run: deploy commands via Discord REST API
9. Output results (JSON or formatted list) based on flags
10. Exit with appropriate status code

### generate-manifest.mjs
1. Define plugin root (src/plugins) and output path (plugin-manifest.json)
2. Recursively walk plugin directory tree
3. For each file, compute relative path from project root
4. Read file contents and generate SHA-256 hash
5. Build manifest map of file paths to hashes
6. Write manifest as JSON to output file
7. Log completion status

## Integration
- **deploy-commands.js**:
  - Depends on: dotenv, discord.js, src/config/config.js, src/utils/logger.js
  - Consumed by: developers/admin during development to register slash commands
  - Output: None (deploys to Discord) or JSON/list to stdout
  - Invoked via: `node scripts/deploy-commands.js` or `pnpm apollo deploy-commands` (if added)
- **generate-manifest.mjs**:
  - Depends on: node:crypto, node:fs, node:path
  - Consumed by: build/deployment pipelines requiring plugin-manifest.json for integrity verification
  - Output: plugin-manifest.json (written to project root)
  - Invoked via: `node scripts/generate-manifest.mjs` or `pnpm manifest` (as defined in package.json)

Both scripts are located in the scripts/ directory and are executed as part of the bot's maintenance workflow.