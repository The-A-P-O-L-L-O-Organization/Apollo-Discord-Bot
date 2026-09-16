#!/usr/bin/env node
import 'dotenv/config';
import { discoverCommands } from '../src/cli/discover.js';
import { run } from '../src/cli/index.js';
import { logger } from '../src/utils/logger.js';

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const commandMap = await discoverCommands();
    const output = await run(argv, commandMap);
    logger.info(output);
    process.exit(0);
}

main().catch((err: unknown) => {
    logger.error(`\x1b[31m[FATAL]\x1b[0m ${(err as Error).message}`);
    process.exit(1);
});
