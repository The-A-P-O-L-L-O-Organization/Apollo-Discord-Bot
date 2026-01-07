# Contributing to John Discord Bot

Thank you for your interest in contributing to John Discord Bot! This document outlines the process for contributing to this project.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Ways to Contribute](#ways-to-contribute)
3. [Development Process](#development-process)
4. [Code Style Guidelines](#code-style-guidelines)
5. [Submitting Changes](#submitting-changes)
6. [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have the following installed:
- Node.js 18.0 or higher
- pnpm (recommended) or npm
- Git
- A code editor (VS Code recommended)

### Setting Up Development Environment

1. **Fork the repository**
   - Click the "Fork" button on the repository page
   - Clone your fork locally:
     ```bash
     git clone https://github.com/YOUR-USERNAME/John-Discord-Bot.git
     cd John-Discord-Bot
     ```

2. **Set up upstream remote**
   ```bash
   git remote add upstream https://github.com/ORIGINAL-OWNER/John-Discord-Bot.git
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
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
   - Environment details (OS, Node.js version, etc.)

### Suggesting Features

Have an idea for a new feature? We'd love to hear it:

1. Check existing feature requests to avoid duplicates
2. Create a new issue with:
   - Clear title for the feature
   - Detailed description of the feature
   - Use cases and benefits
   - Any implementation ideas (optional)

### Writing Code

Areas where we need contributions:
- New commands and features
- Bug fixes
- Performance improvements
- Documentation improvements
- Code refactoring and optimization
- Test coverage

### Improving Documentation

Help us make the documentation better:
- Fix typos and grammatical errors
- Add clearer explanations
- Create examples and tutorials
- Translate documentation

## Development Process

### Branch Naming Convention

Use descriptive branch names:
- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Urgent fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Coding Standards

#### JavaScript Style

- Use ES6+ features (async/await, arrow functions, etc.)
- Use `const` by default, `let` when reassignment is needed
- Use template literals instead of string concatenation
- Use meaningful variable and function names
- Add JSDoc comments for functions

Example:
```javascript
/**
 * Calculates the total latency for a bot command
 * @param {number} roundTrip - Round-trip time in milliseconds
 * @param {number} apiLatency - API latency in milliseconds
 * @returns {object} Latency information with status
 */
function calculateLatency(roundTrip, apiLatency) {
    const totalLatency = roundTrip + apiLatency;
    
    let status;
    if (totalLatency < 100) {
        status = '[EXCELLENT]';
    } else if (totalLatency < 200) {
        status = '[GOOD]';
    } else {
        status = '[MODERATE]';
    }
    
    return {
        roundTrip,
        apiLatency,
        total: totalLatency,
        status
    };
}
```

#### File Organization

- Keep files small and focused
- Use consistent naming (camelCase for files)
- Group related files in appropriate directories
- Follow the existing project structure

#### Comments and Documentation

- Use comments to explain complex logic
- Avoid obvious comments
- Update comments when updating code
- Use clear, English descriptions

### Testing

Before submitting:

1. Test your changes locally
2. Check for syntax errors:
   ```bash
   node --check src/your-file.js
   ```

3. Test the bot functionality:
   ```bash
   pnpm start
   ```

4. Verify all existing functionality still works

## Code Style Guidelines

### General Rules

1. **No emojis in code** - Use text-based status indicators
   - Good: `[SUCCESS]`, `[ERROR]`, `[INFO]`
   - Avoid: `✅`, `❌`, `ℹ️`

2. **Consistent indentation** - Use spaces (4 spaces recommended)

3. **Line length** - Keep lines under 100 characters

4. **No console.log in production** - Use proper logging

5. **Error handling** - Always handle errors gracefully

### Import Statements

Organize imports by type:
```javascript
// Node.js core modules
import { readdirSync } from 'fs';
import { join } from 'path';

// Third-party modules
import { Client, GatewayIntentBits } from 'discord.js';

// Local modules
import { config } from './config/config.js';
import readyHandler from './events/ready.js';
```

### Event Handlers

- Keep event handlers in the `events/` directory
- One event per file
- Clear, descriptive function names

### Commands

- Keep commands in the `commands/` directory
- Follow the standard command structure
- Include proper error handling
- Use slash commands (Application Commands)

## Submitting Changes

### Pull Request Process

1. **Ensure your branch is up to date**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your changes**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request**
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template
   - Describe your changes
   - Link any related issues

4. **PR Title Guidelines**
   - Use clear, descriptive titles
   - Prefix with type: `feat:`, `fix:`, `docs:`, `refactor:`
   - Example: `feat: Add server info command`

5. **PR Description**
   - Explain what you changed
   - List new features or fixes
   - Include screenshots (if UI changes)
   - Note any breaking changes

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, your PR will be merged
4. Thank you for your contribution!

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

### Recognition

All contributors will be recognized in:
- The contributors section of the README
- Release notes
- Community announcements

## Getting Help

If you need assistance:

1. **Check the documentation** - README.md and code comments
2. **Search existing issues** - Your question may already be answered
3. **Create an issue** - For bugs or feature requests
4. **Ask in discussions** - For general questions

## Recognition

Contributors who have made significant contributions:
- Will be added to the README contributors list
- May be given write access to the repository
- Will be mentioned in release notes

## Thank You!

Your contributions make this project better. We appreciate your time and effort!

---

**Note**: By contributing to this project, you agree to follow the code of conduct and contribute guidelines.

