import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ContractRegistry } from '../../../src/core/eventBus/contractRegistry.js';

describe('ContractRegistry', () => {
    it('registers and retrieves entries', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        expect(registry.get('event', 'interlink:message:ping')?.pluginId).toBe('interlink');
        expect(registry.get('rpc', 'interlink:message:ping')).toBeUndefined();
    });

    it('throws on duplicate registration of the same contract', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        expect(() => registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' })).toThrow(/already registered/);
    });

    it('allows the same name under different kinds and plugin ids', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'x' });
        registry.register({ pluginId: 'interlink', kind: 'rpc', name: 'x' });
        registry.register({ pluginId: 'moderation', kind: 'event', name: 'x' });
        expect(registry.get('event', 'x')?.pluginId).toBe('interlink');
        expect(registry.get('rpc', 'x')?.pluginId).toBe('interlink');
    });

    it('attaches a schema to an existing entry and rejects unknown ones', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        const schema = z.object({ nonce: z.string() });
        registry.attachSchema('event', 'interlink:message:ping', schema);
        expect(registry.get('event', 'interlink:message:ping')?.schema).toBe(schema);
        expect(() => registry.attachSchema('event', 'missing', schema)).toThrow(/Unknown contract/);
    });

    it('snapshot is deterministic and manifest-shaped', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'moderation', kind: 'rpc', name: 'moderation:case' });
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        registry.register({ pluginId: 'interlink', kind: 'rpc', name: 'interlink:ping' });
        const snap = registry.snapshot();
        expect(snap.contracts.map((c) => `${c.pluginId}:${c.kind}:${c.name}`)).toEqual([
            'interlink:event:interlink:message:ping',
            'interlink:rpc:interlink:ping',
            'moderation:rpc:moderation:case'
        ]);
    });
});
