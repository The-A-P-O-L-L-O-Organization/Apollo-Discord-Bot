# Contributing to Apollo Discord Bot

Thank you for your interest in contributing to the Apollo Discord Bot! This document outlines the process for contributing to this project.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Ways to Contribute](#ways-to-contribute)
3. [Development Process](#development-process)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Testing](#testing)
6. [Plugin System](#plugin-system)
7. [Submitting Changes](#submitting-changes)
8. [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have the following installed:
- Node.js 26 or higher
- **pnpm 11+** (required — npm and yarn are not supported)
- Git
- A code editor (VS Code recommended)

### Setting Up Development Environment

1. **Fork the repository**
   - Click the "Fork" button on the repository page
   - Clone your fork locally:
     ```bash
     git clone https://github.com/YOUR-USERNAME/Apollo-Discord-Bot.git
     cd Apollo-Discord-Bot
     ```

2. **Set up upstream remote**
   ```bash
   git remote add upstream https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Run tests to verify setup**
   ```bash
   pnpm test
   ```

## Ways to Contribute

### Reporting Bugs

Found a bug? Help us fix it by reporting:

1. Check if the issue already exists in the repository
2. If not, create a new issue with:
   - Clear title describing the problem
   - Detailed description of the bug
   - Steps to reproduce the issue
   - Expected vs actual behavior
   - Error messages and screenshots (if applicable)
   - Environment details (OS, Node.js version, database type, run mode)

### Suggesting Features

Have an idea for a new feature? We'd love to hear it:

1. Check existing feature requests to avoid duplicates
2. Create a new issue with:
   - Clear title for the feature
   - Detailed description of the feature
   - Use cases and benefits
   - Any implementation ideas (optional)
   - Whether it affects the plugin system, multi-instance, or both

### Writing Code

Areas where we need contributions:
- New plugins and commands
- Bug fixes
- Performance improvements
- Documentation improvements
- Code refactoring and optimization
- Test coverage
- Multi-instance infrastructure (Kubernetes manifests, Helm charts)
- CI/CD pipeline enhancements

### Improving Documentation

Help us make the documentation better:
- Fix typos and grammatical errors
- Add clearer explanations
- Create examples and tutorials
- Document plugin APIs and EventBus events

## Development Process

### Branch Naming Convention

Use descriptive branch names:
- `feature/description` — New features and plugins
- `bugfix/description` — Bug fixes
- `hotfix/description` — Urgent fixes
- `docs/description` — Documentation changes
- `refactor/description` — Code refactoring

### Project Architecture

This project uses a **plugin-based architecture** with optional **multi-instance scaling**:

```
src/
├── plugins/           # Self-contained plugin modules
│   ├── core/          # ping, help, userinfo, serverinfo, stats
│   ├── moderation/    # kick, ban, warn, mute, case, blacklist, tempban
│   ├── automod/       # Spam/raid detection, word filters
│   ├── tickets/       # Ticket system, transcripts, panels
│   └── utility/       # Reminders, polls, reaction roles, logging
├── core/              # EventBus, Plugin, PluginManager
├── queue/             # BullMQ jobs, gateway router, metrics
├── gateway/           # Leader election
├── db/                # Knex connection, PG adapter, migrations
└── utils/             # DB bridge, locks, schedulers, modLog
```

**Key Concepts:**

- **Plugin class**: Extends `Plugin` base class with `onLoad(eventBus)` and `onUnload(eventBus)` lifecycle hooks
- **EventBus**: Three-layer inter-plugin communication (events, API registry, reactive state) with optional cross-pod Redis pub/sub bridging
- **Run modes**: `RUN_MODE=gateway` (Discord WebSocket) and `RUN_MODE=worker` (BullMQ consumer)
- **Dual database**: SQLite (development) or PostgreSQL (production multi-writer) via `src/utils/db.js` async bridge
- **Distributed locks**: Redis-based `withLock()` for scheduler coordination across pods

### Coding Standards

#### JavaScript Style

- Use ES modules (`import`/`export`) — the project uses `"type": "module"` in package.json
- Use ES6+ features (`async/await`, arrow functions, destructuring)
- Use `const` by default, `let` when reassignment is needed
- Use template literals instead of string concatenation
- Use meaningful variable and function names
- No emojis in code — use text-based status indicators like `[SUCCESS]`, `[ERROR]`, `[INFO]`

#### File Organization

- **Commands**: Created in the appropriate plugin directory (`src/plugins/<plugin>/commands/`)
- **Events**: Created in the appropriate plugin directory (`src/plugins/<plugin>/events/`)
- **Shared utilities**: Placed in `src/utils/`
- **Tests**: Placed in `tests/` mirroring the source structure

#### Command Structure

```js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';

export default {
    name: 'example',
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('An example command'),
    category: 'Utility',

    async execute(interaction) {
        try {
            // Command logic
            await interaction.reply({ content: 'Done!' });
        } catch (error) {
            console.error('[ERROR] Example command error:', error);
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: '[ERROR] Command Failed',
                    description: error.message
                }],
                ephemeral: true
            });
        }
    }
};
```

#### Plugin Structure

```js
import { Plugin } from '../../core/Plugin.js';

export default class MyPlugin extends Plugin {
    constructor() {
        super('my-plugin'); // Unique plugin ID
    }

    async onLoad(eventBus) {
        // Register commands
        this.commands = [exampleCommand];

        // Register event listeners
        eventBus.on('moderation:action', this.handleModAction);

        // Provide APIs for other plugins
        eventBus.provide('my-plugin:doThing', this.doThing);

        // Set up reactive state
        eventBus.provideState('my-plugin:config', { enabled: true });
    }

    async onUnload(eventBus) {
        // Cleanup
        eventBus.unprovide('my-plugin:doThing');
        eventBus.removeAllListeners('moderation:action');
    }
}
```

#### Inter-Plugin Communication

```js
// Fire-and-forget event
eventBus.emit('tickets:closed', { ticketNumber: 1, guildId: '123' });
eventBus.on('tickets:closed', (data) => { /* react */ });

// Request-response API
eventBus.provide('moderation:getWarnings', async (guildId, userId) => { /* ... */ });
const warnings = await eventBus.call('moderation:getWarnings', guildId, userId);

// Reactive state
eventBus.provideState('config:prefix', '!');
eventBus.setState('config:prefix', '?');
const current = eventBus.getState('config:prefix');
eventBus.watchState('config:prefix', (newVal, oldVal) => { /* onChange */ });
```

#### Import Organization

```js
// Third-party modules
import { Client, GatewayIntentBits } from 'discord.js';

// Local utilities
import { config } from '../config/config.js';
import { updateGuildData } from '../utils/db.js';

// Local commands/events
import myCommand from './commands/mycommand.js';
```

## Testing

This project uses **Vitest** as the testing framework. All tests use mocked Discord.js objects for isolated, deterministic testing.

### Running Tests

```bash
pnpm test              # Run full suite
pnpm test:watch        # Watch mode (TDD)
pnpm test:coverage     # With coverage report
pnpm test -- tests/commands/ping.test.js  # Single file
```

### Writing Tests

Tests should cover command metadata, execute behavior, error cases, and edge cases:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import myCommand from '../../src/plugins/moderation/commands/mycommand.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';

// Mock database (always needed for commands that access db)
vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    updateGuildData: vi.fn((store, guildId, updater) =>
        Promise.resolve(updater({ nextCaseId: 1 }))),
}));

// Mock modLog (always needed for moderation commands)
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined),
    fetchMember: vi.fn()
}));

describe('MyCommand', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = createMockInteraction({
            user: createMockUser({ id: '999', tag: 'Tester#0001' }),
            guild: createMockGuild({ id: '123' }),
            options: {
                getUser: vi.fn().mockReturnValue(targetUser),
                getString: vi.fn().mockReturnValue('reason')
            }
        });
    });

    it('should have correct metadata', () => {
        expect(myCommand.name).toBe('mycommand');
        expect(myCommand.category).toBe('Moderation');
    });

    it('should execute successfully', async () => {
        await myCommand.execute(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalled();
    });
});
```

### Mock Factories

Use the mock factories in `tests/mocks/discord.js`:

| Factory | Purpose | Key properties |
|---------|---------|---------------|
| `createMockInteraction(opts)` | Slash command interaction | `reply`, `editReply`, `deferReply`, `followUp`, `options.getUser/String` |
| `createMockUser(opts)` | Discord user | `id`, `tag`, `bot`, `send` |
| `createMockMember(opts)` | Guild member | `timeout`, `kick`, `ban`, `roles`, `moderatable`, `kickable` |
| `createMockGuild(opts)` | Discord guild | `channels`, `roles`, `members`, `bans` |
| `createMockChannel(opts)` | Text channel | `send`, `delete`, `messages.fetch` |
| `createMockClient(opts)` | Discord client | `users.fetch`, `guilds.cache` |
| `MockCollection` | Map extension | Acts like Discord.js Collection |

### Test Coverage Requirements

- New commands must include tests for: metadata validation, execute success path, error cases, edge cases
- New events must include tests for: handler behavior with valid/invalid data, error handling
- New utilities must include unit tests for all exported functions
- Bug fixes must include a regression test

## Submitting Changes

### Pull Request Process

1. **Ensure your branch is up to date**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run the full test suite**
   ```bash
   pnpm test
   ```

3. **Check for lint errors**
   ```bash
   pnpm lint
   ```

4. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template (see below)

6. **PR Title Guidelines**
   - Use clear, descriptive titles
   - Prefix with type: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
   - Example: `feat: Add plugin API for remote installation`

7. **PR Description Template**
   ```markdown
   ## Summary
   <!-- Brief description of changes -->

   ## Changes
   - <!-- List specific changes -->

   ## Testing
   - [ ] All existing tests pass
   - [ ] Added tests for new functionality
   - [ ] Tested manually with SQLite
   - [ ] Tested manually with PostgreSQL (if DB changes)

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update
   - [ ] Performance improvement
   ```

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. CI must pass (lint + test + build)
4. Once approved, your PR will be merged
5. Thank you for your contribution!

### Multi-Instance Considerations

If your changes affect shared state or database access:
- Ensure all DB operations use the async `updateGuildData` pattern (not get+mutate+set)
- Use distributed locks (`withLock`) for any time-based scheduling
- Avoid in-memory state that must be consistent across pods (use Redis or PostgreSQL)
- Add or update EventBus events/APIs for cross-plugin communication
- Test with `DB_TYPE=postgres` and `REDIS_URL` set

## Code Style Guidelines

### General Rules

1. **No emojis in code** — Use text-based status indicators
   - Good: `[SUCCESS]`, `[ERROR]`, `[INFO]`
   - Avoid: `✅`, `❌`, `ℹ️`

2. **Consistent indentation** — 4 spaces (no tabs)

3. **Line length** — Keep lines under 120 characters

4. **Error handling** — Always wrap command execution in try/catch with user-friendly error messages

5. **Async/await** — Use `async/await` over `.then()/.catch()`

6. **No emojis in commit messages**

### Database Access

Always use the async bridge in `src/utils/db.js`:

```js
// ✅ Correct — async, works with both SQLite and PostgreSQL
const data = await getGuildData('my-store', guildId);
await updateGuildData('my-store', guildId, (current) => {
    current.counter = (current.counter || 0) + 1;
    return current;
});

// ❌ Wrong — direct adapter access, no SQLite fallback
import { getGuildData } from '../db/adapter.js';
```

For atomic updates, use `updateGuildData` over get+mutate+set:

```js
// ✅ Correct — atomic, no race condition
await updateGuildData('tickets', guildId, (data) => {
    data.openTickets.push(newTicket);
    return data;
});

// ❌ Wrong — race condition in multi-pod deployment
const data = await getGuildData('tickets', guildId);
data.openTickets.push(newTicket);
await setGuildData('tickets', guildId, data);
```

## Community Guidelines

### Be Respectful

- Treat all contributors with respect
- Provide constructive feedback
- Be patient with new contributors
- Avoid criticism without solutions

### Communication

- Use clear, professional language
- Ask questions when unsure
- Explain your reasoning
- Stay on topic

## Getting Help

If you need assistance:

1. **Check the documentation** — README.md and code comments
2. **Search existing issues** — Your question may already be answered
3. **Create an issue** — For bugs or feature requests
4. **Ask in discussions** — For general questions

## Thank You!

Your contributions make this project better. We appreciate your time and effort!

---

**Note**: By contributing to this project, you agree to follow the code of conduct and contribute guidelines.
