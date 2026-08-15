Responsibility
Provides the entry point for worker plugin processes in test fixtures, initializing child worker communication and message handling.

Design
Uses the worker child pattern: a script that imports runChild from the core worker module, configures the plugin directory via environment variable, and sets up a message listener to delegate incoming messages to the child worker instance.

Flow
1. Reads PLUGIN_DIR from process.env.
2. Calls runChild with pluginDir and environment, returning a child worker instance.
3. Registers a 'message' event listener on process to forward received messages to child.handleMessage.
4. On runChild rejection, logs error and exits process with code 1.

Integration
Depends on src/core/worker/workerChild.js for runChild function and node:url for pathToFileURL.
Consumed by test harness that spawns this file as a child process, setting PLUGIN_DIR and communicating via IPC messages.