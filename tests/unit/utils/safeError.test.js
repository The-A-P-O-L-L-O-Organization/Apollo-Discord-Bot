import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeError } from '../../../src/utils/safeError.js';

describe('safeError', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return a generic message', () => {
        const msg = safeError(new Error('secret db password in stack'));
        expect(msg).toBe('An unexpected error occurred. Please try again later.');
        expect(msg).not.toContain('secret');
    });

    it('should log the real message server-side', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        safeError(new Error('real internal detail'));
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0].join(' ')).toContain('real internal detail');
    });

    it('should handle non-Error inputs', () => {
        expect(safeError('string error')).toBe('An unexpected error occurred. Please try again later.');
        expect(safeError(undefined)).toBe('An unexpected error occurred. Please try again later.');
    });
});
