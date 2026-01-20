// Test Setup File
// Configures the test environment

import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Provide access to vi globally
global.vi = vi;
