import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async () => ({})),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({ prefix: '!', locale: 'en-US' }))
}));

vi.mock('../src/utils/modLog.js', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../src/utils/modLog.js')>();
    return { ...orig, logLocaleChange: vi.fn(async () => undefined) };
});

function fakeInteraction(overrides: Record<string, unknown> = {}) {
    const emit = vi.fn(async () => undefined);
    const reply = vi.fn(async () => undefined);
    const interaction = {
        guildId: 'g1',
        guild: { id: 'g1' },
        locale: 'en-US',
        guildLocale: 'en-US',
        user: { id: 'u1', tag: 'Tester#0001' },
        client: { bus: { emit } },
        options: { getString: (_name: string) => 'es-ES' },
        reply,
        ...overrides
    };
    return { interaction, emit, reply };
}

describe('language command', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
    });

    it('writes via updateGuildData merge updater preserving sibling keys', async () => {
        const { getGuildData, updateGuildData } = await import('../src/utils/db.js');
        vi.mocked(getGuildData).mockResolvedValueOnce({ prefix: '!', locale: 'en-US' });
        const mod = await import('../src/plugins/admin/commands/language.js');
        const { interaction, emit } = fakeInteraction();
        const { localeCache } = await import('../src/i18n/localeCache.js');
        localeCache.set('g1', 'en-US');
        await mod.default.execute(interaction as never);
        expect(updateGuildData).toHaveBeenCalledWith('settings', 'g1', expect.any(Function));
        const updater = vi.mocked(updateGuildData).mock.calls.at(-1)?.[2] as (cur: Record<string, unknown>) => Record<string, unknown>;
        expect(updater({ prefix: '!', locale: 'en-US', other: 1 })).toEqual({ prefix: '!', locale: 'es-ES', other: 1 });
        expect(localeCache.get('g1')).toBeUndefined();
        expect(emit).toHaveBeenCalledWith('i18n:localeChanged', { guildId: 'g1', locale: 'es-ES' });
    });

    it('unsupported code yields localized error and writes nothing', async () => {
        const { updateGuildData } = await import('../src/utils/db.js');
        const { i18n } = await import('../src/i18n/index.js');
        const mod = await import('../src/plugins/admin/commands/language.js');
        const callsBefore = vi.mocked(updateGuildData).mock.calls.length;
        const { interaction, reply } = fakeInteraction({ options: { getString: (_name: string) => 'xx' } });
        await mod.default.execute(interaction as never);
        expect(reply).toHaveBeenCalledTimes(1);
        expect(reply.mock.calls.at(0)?.at(0)).toMatchObject({ content: i18n.tFor(interaction as never, 'admin:language.unsupported', { vars: { locale: 'xx' } }) });
        expect(vi.mocked(updateGuildData).mock.calls.length).toBe(callsBefore);
    });

    it('logs every change with actor, old, and new locale', async () => {
        const { getGuildData } = await import('../src/utils/db.js');
        const { logLocaleChange } = await import('../src/utils/modLog.js');
        vi.mocked(getGuildData).mockResolvedValueOnce({ prefix: '!', locale: 'en-US' });
        const mod = await import('../src/plugins/admin/commands/language.js');
        const { interaction } = fakeInteraction({ options: { getString: (_name: string) => 'de' } });
        await mod.default.execute(interaction as never);
        expect(logLocaleChange).toHaveBeenCalledWith({ guildId: 'g1', actor: { id: 'u1', tag: 'Tester#0001' }, oldLocale: 'en-US', newLocale: 'de' });
    });

    it('subscribeInvalidation clears cache entry on i18n:localeChanged', async () => {
        const { localeCache, subscribeInvalidation } = await import('../src/i18n/localeCache.js');
        const on = vi.fn(() => () => undefined);
        subscribeInvalidation({ on, emit: async () => undefined } as never);
        expect(on).toHaveBeenCalledWith('i18n:localeChanged', expect.any(Function), 'i18n');
        const handler = on.mock.calls.at(0)?.at(1) as unknown as (msg: unknown) => void;
        localeCache.set('g9', 'de');
        handler({ event: 'i18n:localeChanged', payload: { guildId: 'g9', locale: 'es-ES' } });
        expect(localeCache.get('g9')).toBeUndefined();
    });
});
