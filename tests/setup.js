// Test Setup File
// Configures the test environment

import { vi } from 'vitest';
import { EmbedBuilder } from 'discord.js';

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Provide access to vi globally
global.vi = vi;

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
