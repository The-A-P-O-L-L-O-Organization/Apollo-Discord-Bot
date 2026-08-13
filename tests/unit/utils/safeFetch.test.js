import { describe, it, expect, vi } from 'vitest';
import { safeFetch } from '../../../src/utils/safeFetch.js';

describe('safeFetch', () => {
    it('should reject non-https URLs', async () => {
        await expect(safeFetch('http://example.com/')).rejects.toThrow(/https/i);
    });

    it('should reject URLs resolving to private IPs', async () => {
        await expect(safeFetch('https://localhost/')).rejects.toThrow(/private|internal|localhost/i);
    });

    it('should enforce a response size cap', async () => {
        const big = Buffer.alloc(1024);
        const fetchImpl = async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => 'application/octet-stream' },
            url: 'https://example.com/big',
            arrayBuffer: async () => big
        });
        await expect(safeFetch('https://example.com/big', { maxBytes: 512, fetchImpl }))
            .rejects.toThrow(/too large|exceeds/i);
    });

    it('should abort on timeout', async () => {
        const fetchImpl = async (url, opts) => {
            return new Promise((_, reject) => {
                const timer = setTimeout(() => reject(new Error('timeout')), 200);
                opts.signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new Error('aborted'));
                });
            });
        };
        await expect(safeFetch('https://example.com/slow', { timeoutMs: 50, fetchImpl }))
            .rejects.toThrow();
    });

    it('should return buffer and content-type for valid responses', async () => {
        const chunk = Buffer.from('hello');
        const fetchImpl = async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: (name) => name === 'content-type' ? 'text/plain' : null },
            url: 'https://example.com/',
            arrayBuffer: async () => chunk
        });
        const result = await safeFetch('https://example.com/', { fetchImpl });
        expect(result.buffer).toEqual(chunk);
        expect(result.contentType).toBe('text/plain');
    });
});
