# Responsibility
Provides global test environment configuration and utilities for the Vitest test suite, including mocking console output and extending Discord.js EmbedBuilder with property getters for test assertions.

# Design
Implements a test setup module using Vitest's `setupFiles` pattern. Uses ES6 imports for vitest and discord.js. Applies Object.defineProperty to extend EmbedBuilder.prototype with getter methods for title, description, color, fields, footer, thumbnail, and image properties. Mocks console.log and console.error via vi.spyOn to suppress test output.

# Flow
Test execution begins with Vitest automatically importing this setup file. The module executes top-level code: imports vi and EmbedBuilder, spies on console methods and replaces them with no-op functions, assigns vi to global scope, defines embedGetterMap mapping property names to internal data keys, iterates over entries to conditionally define getters on EmbedBuilder.prototype if they do not already exist. Subsequent test files can access vi globally and use EmbedBuilder instances with the added getters to inspect embed properties during assertions.

# Integration
Dependencies: vitest (vi), discord.js (EmbedBuilder). Consumed by all test files via Vitest configuration (setupFiles). No direct exports; modifies global state and prototype extensions.