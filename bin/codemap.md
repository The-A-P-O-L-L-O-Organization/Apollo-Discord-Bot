Responsibility
Entry point script for the Discord bot application responsible for bootstrapping the environment, discovering available commands, and executing the CLI interface.

Design
Modular architecture with separation of concerns; uses dotenv for environment configuration; imports discoverCommands to dynamically build a command map; delegates command execution to a run function; follows Node.js CLI pattern with an async main function and centralized error handling.

Flow
1. Load environment variables via dotenv/config.
2. Capture command-line arguments from process.argv (excluding the first two elements).
3. Await discoverCommands() to scan src/cli/commands and produce a command map.
4. Pass the arguments and command map to run() to generate command output.
5. Print the output to stdout.
6. Catch any asynchronous errors, log them with a [FATAL] prefix, and exit with code 1.

Integration
Dependencies: dotenv package.
Imports: ../src/cli/discover.js (discoverCommands), ../src/cli/index.js (run).
Consumed by: npm/yarn scripts or direct execution via node bin/apollo.js.
No explicit hooks or events; integrates with the CLI layer of the application.