#!/usr/bin/env node
import 'dotenv/config';
import { discoverCommands } from '../src/cli/discover.js';
import { run } from '../src/cli/index.js';

async function main() {
    const argv = process.argv.slice(2);
    const commandMap = await discoverCommands();
    const output = await run(argv, commandMap);
    console.log(output);
    process.exit(0);
}

main().catch(err => {
    console.error(`\x1b[31m[FATAL]\x1b[0m ${err.message}`);
    process.exit(1);
});
