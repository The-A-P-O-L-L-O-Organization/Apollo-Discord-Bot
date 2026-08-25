Responsibility
Provides a command-line interface for managing the Apollo Discord bot, including argument parsing, command discovery from plugin CLI modules, output formatting, and inter-process communication with the bot core via Unix socket.

Design
Modular architecture separating concerns: argument parsing (parse.js), text formatting (format.js), command discovery from plugin directories (discover.js), socket-based client/server communication (socket-client.js, socket-server.js), and central orchestration (index.js). Uses Facade pattern in index.js to coordinate submodules, Strategy pattern for plugin command handlers, and Dependency Injection for plugin manager integration.

Flow
1. CLI entry point (index.js) receives process.argv.
2. parseArgs splits argv into command path and flag object.
3. discoverCommands scans ../plugins/*/cli/index.js to build commandMap.
4. resolveCommand matches path against commandMap to locate target command.
5. If command.needsSocket, sendSocketCommand transmits JSON payload to Unix socket; otherwise executes command.execute locally.
6. Results are formatted via formatSuccess/formatError/formatInfo and returned as string.
7. Flags validation and help generation occur throughout.

Integration
- Dependencies: Node.js net, fs, crypto, url, path modules.
- Consumes: Plugin system (each plugin's cli/index.js exporting default with commands array).
- Consumed by: Bin script (presumed) invoking index.run; SocketServer (src/cli/socket-server.js) for inbound commands from bot core.
- Integration points: UNIX socket at /tmp/apollo.sock (or APOLLO_SOCKET_PATH) with optional APOLLO_SOCKET_TOKEN auth.