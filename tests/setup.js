// Test Setup File
// Configures the test environment

import { vi } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import { runMigrations, closeDb, resetTestDb } from '../src/db/knex.js';

// Provide access to vi globally
global.vi = vi;

// Mock console methods to reduce noise in tests
// This runs after each test's beforeEach to ensure spies are active
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Run migrations before all tests
beforeAll(async () => {
    await resetTestDb();
    await runMigrations();
});

// Close database after all tests
afterAll(async () => {
    await closeDb();
});

// Restore and clear mocks after each test for isolation
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

const embedGetterMap = {
    title: 'title',
    description: 'description',
    color: 'color',
    fields: 'fields',
    footer: 'footer',
    thumbnail: 'thumbnail',
    image: 'image'
};

for (const [prop, dataKey] of Object.entries(embedGetterMap)) {
    if (!Object.getOwnPropertyDescriptor(EmbedBuilder.prototype, prop)) {
        Object.defineProperty(EmbedBuilder.prototype, prop, {
            get() {
                return this.data?.[dataKey];
            }
        });
    }
}
