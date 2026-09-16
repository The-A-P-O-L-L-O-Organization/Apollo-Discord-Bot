import { describe, it, expect } from 'vitest';
import { config } from '../../../src/config/config.js';

describe('Database config', () => {
  it('should default to sqlite', () => {
    expect(config.database.type).toBe('sqlite');
  });

  it('should have postgres config with defaults', () => {
    expect(config.database.postgres).toBeDefined();
    expect(config.database.postgres.pool.min).toBeGreaterThan(0);
    expect(config.database.postgres.pool.max).toBeGreaterThan(0);
  });
});
