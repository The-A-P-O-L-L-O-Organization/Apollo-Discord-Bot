import { describe, it, expect } from 'vitest';
import { sortByDependencies, enablePluginsParallel } from '../../src/core/PluginDependencyResolver.js';

function makeRegistry(entries: [string, string[]][]): Map<string, { dependencies: string[] }> {
    return new Map(entries.map(([id, deps]) => [id, { dependencies: deps }]));
}

describe('sortByDependencies', () => {
    it('returns dependencies before dependents', () => {
        const registry = makeRegistry([['a', []], ['b', ['a']], ['c', ['a', 'b']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(sortByDependencies(['c', 'b', 'a'], getDeps)).toEqual(['a', 'b', 'c']);
    });

    it('throws on circular dependencies', () => {
        const registry = makeRegistry([['x', ['y']], ['y', ['x']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(() => sortByDependencies(['x', 'y'], getDeps)).toThrow(/Circular dependency/);
    });

    it('ignores deps outside the id set', () => {
        const registry = makeRegistry([['a', ['ghost']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(sortByDependencies(['a'], getDeps)).toEqual(['a']);
    });
});

describe('enablePluginsParallel', () => {
    it('enables dependencies before dependents', async () => {
        const registry = makeRegistry([['a', []], ['b', ['a']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        const order: string[] = [];
        await enablePluginsParallel(['a', 'b'], getDeps, async (id) => { order.push(id); });
        expect(order).toEqual(['a', 'b']);
    });

    it('enables independent plugins concurrently within a level', async () => {
        const registry = makeRegistry([['a', []], ['c', []]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        const active = new Set<string>();
        let maxConcurrent = 0;
        await enablePluginsParallel(['a', 'c'], getDeps, async (id) => {
            active.add(id);
            maxConcurrent = Math.max(maxConcurrent, active.size);
            await new Promise(resolve => setTimeout(resolve, 0));
            active.delete(id);
        });
        expect(maxConcurrent).toBe(2);
    });

    it('propagates an enable() rejection and stops later levels', async () => {
        const registry = makeRegistry([['a', []], ['b', ['a']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        const calls: string[] = [];
        await expect(enablePluginsParallel(['a', 'b'], getDeps, async (id) => {
            calls.push(id);
            if (id === 'a') { throw new Error('enable failed'); }
        })).rejects.toThrow('enable failed');
        expect(calls).not.toContain('b');
    });
});
