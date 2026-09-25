import { describe, it, expect, vi } from 'vitest';
import type { WorkerHostOptions } from '../src/core/worker/workerHost.js';

function makeHost() {
    return import('../src/core/worker/workerHost.js').then(({ WorkerHost }) => new WorkerHost({
        fork: vi.fn().mockReturnValue({ send: vi.fn(), on: vi.fn(), kill: vi.fn() }) as unknown as WorkerHostOptions['fork'],
        log: () => {},
        now: () => 1000,
        backoff: (attempt: number) => Math.min(1000 * 2 ** attempt, 60000)
    }));
}

describe('worker sandbox i18n capability', () => {
    it('allows api:i18n in manifests while rejecting unknown capabilities', async () => {
        const { normalizeCapabilities, KNOWN_CAPABILITIES } = await import('../src/core/worker/pluginManifest.js');
        expect(KNOWN_CAPABILITIES.has('api:i18n')).toBe(true);
        expect(normalizeCapabilities(['api:i18n'])).toEqual(['api:i18n']);
        expect(() => normalizeCapabilities(['totally:fake'])).toThrow(/unknown capability/i);
    });

    it('excludes api:i18n from high-risk capabilities', async () => {
        const { HIGH_RISK_CAPABILITIES } = await import('../src/core/worker/workerHost.js');
        expect(HIGH_RISK_CAPABILITIES.has('api:i18n')).toBe(false);
    });

    it('resolves es via host-side getFixedT when granted, never granting fs', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        const host = await makeHost();
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:i18n'],
            manifest: { id: 'demo', capabilities: ['api:i18n'] }
        });
        const result = await host.handleI18nCall('demo', { key: 'ok', locale: 'es-ES', ns: 'common' });
        expect(result).toMatchObject({ ok: true, text: 'OK' });
        const granted = host.getWorker('demo')?.granted ?? [];
        expect(granted).toContain('api:i18n');
        expect(granted.some((cap) => cap.startsWith('fs'))).toBe(false);
    });

    it('denies api:i18n when the capability was not granted', async () => {
        const host = await makeHost();
        await host.startPlugin({
            pluginId: 'plain',
            dir: '/data/plugins/plain',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'plain', capabilities: ['api:sendMessage'] }
        });
        const result = await host.handleI18nCall('plain', { key: 'ok', locale: 'es-ES', ns: 'common' });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not granted/i);
    });

    it('rejects oversize i18n payloads per the rpc limit', async () => {
        const host = await makeHost();
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:i18n'],
            manifest: { id: 'demo', capabilities: ['api:i18n'] }
        });
        const result = await host.handleI18nCall('demo', { key: 'ok', locale: 'es-ES', ns: 'common', vars: { blob: 'x'.repeat(2 * 1024 * 1024) } });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/size limit/i);
    });

    it('child helper resolves es through host.call api:i18n', async () => {
        const { requestWorkerTranslation } = await import('../src/core/worker/workerChild.js');
        const call = vi.fn(async () => ({ ok: true, text: 'Vale' }));
        const host = { allowedCapabilities: new Set(['api:i18n']), call };
        const text = await requestWorkerTranslation(host, { key: 'ok', locale: 'es-ES', ns: 'common' });
        expect(text).toBe('Vale');
        expect(call).toHaveBeenCalledWith('api:i18n', expect.objectContaining({ key: 'ok', locale: 'es-ES' }));
    });
});

describe('interlink raw-locale (Option A)', () => {
    it('callee translates the caller locale, never pre-translated strings', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        const { resolveInterlinkLocale, extractInterlinkLocale, translateInterlinkKey } = await import('../src/plugins/interlink/locale.js');
        expect(extractInterlinkLocale({ locale: 'es-ES', command: 'ping' })).toBe('es-ES');
        expect(resolveInterlinkLocale('es-ES')).toBe('es-ES');
        expect(translateInterlinkKey('ok', 'es-ES')).toBe('OK');
    });

    it('falls back to en-US for unsupported locales', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        const { resolveInterlinkLocale, translateInterlinkKey } = await import('../src/plugins/interlink/locale.js');
        expect(resolveInterlinkLocale('xx-YY')).toBe('en-US');
        expect(translateInterlinkKey('ok', 'xx-YY')).toBe('OK');
    });
});
