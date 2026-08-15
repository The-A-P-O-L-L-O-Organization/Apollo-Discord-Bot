# src/plugins/moderation/cli/

## Responsibility
This directory contains the command definition module for moderation-related CLI commands in the Discord bot. It defines the structure, metadata, and execution logic for moderation commands such as ban, kick, mute, warn, case lookup, clear, slowmode, and lockdown.

## Design
Uses the Command pattern where each command is an object with properties: name, description, needsSocket (boolean), options (array of option descriptors), and optionally an execute async function. Options follow a consistent schema with name, description, required flag, and optionally choices. The module exports a default object with a name, description, and commands array.

## Flow
Data enters the module when the command handler invokes a command's execute function (if present) with an args object containing parsed command arguments and guild ID. For the 'case' command, execute calls getGuildData('moderation', args.guild) to retrieve moderation data from the database, extracts the cases array, finds the case matching args.id, and returns the case object or an error message. For other commands, execution logic is handled elsewhere (likely in a command processor) based on the command definition. State transitions: none internal; the module is static definition.

## Integration
Depends on ../../../utils/db.js for getGuildData function. Consumed by the command dispatching/invocation system (likely in src/modules/commandHandler.js or similar) which reads the exported command definitions to register and execute moderation commands. No internal hooks or events.