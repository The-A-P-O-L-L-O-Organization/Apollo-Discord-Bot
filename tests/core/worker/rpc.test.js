import { describe, it, expect } from 'vitest';
import {
    MAX_PAYLOAD_BYTES,
    isRequest,
    isResponse,
    createRequest,
    createResponse,
    serialize,
    deserialize,
    isOversize
} from '../../../src/core/worker/rpc.js';

describe('rpc framing', () => {
    it('should create a request with correlation id', () => {
        const req = createRequest('pluginA', 'events:messageCreate', { msg: 'hi' });
        expect(req.kind).toBe('request');
        expect(req.pluginId).toBe('pluginA');
        expect(req.method).toBe('events:messageCreate');
        expect(req.correlationId).toBeTruthy();
        expect(req.payload).toEqual({ msg: 'hi' });
    });

    it('should create a response echoing the correlation id', () => {
        const req = createRequest('p', 'm', {});
        const res = createResponse(req.correlationId, { ok: true });
        expect(res.kind).toBe('response');
        expect(res.correlationId).toBe(req.correlationId);
        expect(res.result).toEqual({ ok: true });
    });

    it('should flag oversize payloads', () => {
        const big = createRequest('p', 'm', { data: 'x'.repeat(MAX_PAYLOAD_BYTES + 10) });
        expect(isOversize(big)).toBe(true);
        const small = createRequest('p', 'm', { data: 'x'.repeat(10) });
        expect(isOversize(small)).toBe(false);
    });

    it('should round-trip serialization', () => {
        const payload = { a: 1, b: ['x', { y: 2 }] };
        const serialized = serialize(payload);
        const back = deserialize(serialized);
        expect(back).toEqual(payload);
    });

    it('should identify requests and responses', () => {
        const req = createRequest('p', 'm', {});
        const res = createResponse(req.correlationId, {});
        expect(isRequest(req)).toBe(true);
        expect(isRequest(res)).toBe(false);
        expect(isResponse(res)).toBe(true);
        expect(isResponse(req)).toBe(false);
        expect(isRequest(null)).toBe(false);
        expect(isResponse(null)).toBe(false);
    });
});
