import { describe, it, expect } from 'vitest';
import {
    signRequest,
    bodyHashOf
} from '../../src/plugins/interlink/connectClient.js';
import { RegisterBotRequest } from '../../src/generated/interlink/interlink/v1/interlink_pb.js';

describe('Interlink auth vectors', () => {
    it('matches the Go verifier signature for fixed inputs', () => {
        const message = new RegisterBotRequest({
            botId: 'integration-bot-x',
            publicKey: 'test-public-key',
            endpoint: 'http://127.0.0.1:1',
            capabilities: { test: 'true' },
            maxConcurrentStreams: 10
        });
        const bodyHash = bodyHashOf(message);
        const sig = signRequest(
            'fixed-test-key-0123456789abcdef',
            '/interlink.v1.InterlinkService/RegisterBot',
            '1758489771000',
            'abcdef0123456789abcdef0123456789',
            bodyHash
        );
        expect(bodyHash).toBe('707152a8928e34a5415a356b759175a8d0e5b0bcba04d66384a15e6058bc831f');
        expect(sig).toBe('tjutzoBq7RZfUXLsuZq76+FX8lepsrSSOM008iy1A2g=');
    });

    it('pins the multi-entry map body hash across languages', () => {
        const message = new RegisterBotRequest({
            botId: 'pin-bot',
            publicKey: 'pin-public-key',
            endpoint: 'https://example.com/hook',
            capabilities: { zeta: '1', alpha: '2', mid: '3' },
            maxConcurrentStreams: 5
        });
        const want = '7141cf5f09622c9d3dc80fef52153c94ad3d4bfb8965667b8fd5469cf8367ebf';
        expect(bodyHashOf(message)).toBe(want);
        const reordered = new RegisterBotRequest({
            botId: 'pin-bot',
            publicKey: 'pin-public-key',
            endpoint: 'https://example.com/hook',
            capabilities: { alpha: '2', mid: '3', zeta: '1' },
            maxConcurrentStreams: 5
        });
        expect(bodyHashOf(reordered)).toBe(want);
    });
});
