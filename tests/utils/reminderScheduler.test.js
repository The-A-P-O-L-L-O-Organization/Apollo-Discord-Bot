// Reminder Scheduler Tests
// Tests for the reminder utility functions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTimeString } from '../../src/utils/reminderScheduler.js';

describe('Reminder Scheduler Utility', () => {
    describe('parseTimeString', () => {
        it('should parse seconds correctly', () => {
            expect(parseTimeString('30s')).toBe(30000);
            expect(parseTimeString('1s')).toBe(1000);
            expect(parseTimeString('120s')).toBe(120000);
        });

        it('should parse minutes correctly', () => {
            expect(parseTimeString('1m')).toBe(60000);
            expect(parseTimeString('30m')).toBe(1800000);
            expect(parseTimeString('60m')).toBe(3600000);
        });

        it('should parse hours correctly', () => {
            expect(parseTimeString('1h')).toBe(3600000);
            expect(parseTimeString('24h')).toBe(86400000);
            expect(parseTimeString('2h')).toBe(7200000);
        });

        it('should parse days correctly', () => {
            expect(parseTimeString('1d')).toBe(86400000);
            expect(parseTimeString('7d')).toBe(604800000);
            expect(parseTimeString('30d')).toBe(2592000000);
        });

        it('should parse weeks correctly', () => {
            expect(parseTimeString('1w')).toBe(604800000);
            expect(parseTimeString('2w')).toBe(1209600000);
        });

        it('should be case insensitive', () => {
            expect(parseTimeString('1M')).toBe(60000);
            expect(parseTimeString('1H')).toBe(3600000);
            expect(parseTimeString('1D')).toBe(86400000);
            expect(parseTimeString('1S')).toBe(1000);
            expect(parseTimeString('1W')).toBe(604800000);
        });

        it('should return null for invalid formats', () => {
            expect(parseTimeString('')).toBeNull();
            expect(parseTimeString('abc')).toBeNull();
            expect(parseTimeString('10')).toBeNull();
            expect(parseTimeString('m10')).toBeNull();
            expect(parseTimeString('10x')).toBeNull();
            expect(parseTimeString('10 m')).toBeNull();
        });

        it('should return null for invalid numbers', () => {
            expect(parseTimeString('0m')).toBe(0); // 0 is valid
            expect(parseTimeString('-1m')).toBeNull();
        });

        it('should handle large numbers', () => {
            expect(parseTimeString('1000m')).toBe(60000000);
            expect(parseTimeString('999h')).toBe(3596400000);
        });
    });
});
