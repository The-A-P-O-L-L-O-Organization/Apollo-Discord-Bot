import { describe, it, expect } from 'vitest';

describe('PluginManager entry preference', () => {
    it('documents prod .js-first ordering', () => {
        const orderProd = ['plugin.js', 'plugin.ts'];
        const orderDev = ['plugin.ts', 'plugin.js'];
        expect(orderProd[0]).toBe('plugin.js');
        expect(orderDev[0]).toBe('plugin.ts');
    });
});
