#!/usr/bin/env node
import 'dotenv/config';
import { discoverCommands } from '../src/cli/discover.js';
import { run } from '../src/cli/index.js';
import { logger } from './utils/logger.js';
import { logger } from '../src/utils/logger.js';

async function main() {
    const argv = process.argv.slice(2);
    const commandMap = await discoverCommands();
    const output = await run(argv, commandMap);
    logger.info(output);
    process.exit(0);
}

main().catch(err => {
    logger.error(`\x1b[31m[FATAL]\x1b[0m ${err.message}`);
    process.exit(1);
});
