import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async (_store: string, guildId: string) => {
        if (guildId === 'g-es') {
            return { locale: 'es-ES' };
        }
        return {};
    }),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({}))
}));

function fakePingInteraction(overrides: Record<string, unknown> = {}) {
    const deferReply = vi.fn(async () => undefined);
    const editReply = vi.fn(async () => undefined);
    return {
        createdTimestamp: Date.now() - 50,
        locale: 'es-ES',
        guildLocale: 'es-ES',
        guildId: 'g-es',
        client: { ws: { ping: 42 } },
        user: { id: 'u1', tag: 'Tester#0001', displayAvatarURL: () => 'https://example.com/avatar.png' },
        deferReply,
        editReply,
        replied: false,
        deferred: true,
        ...overrides
    };
}

describe('utility i18n matrix', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces('utility');
    });

    it('guild interaction with stored es-ES locale renders Spanish ping embed', async () => {
        const mod = await import('../src/plugins/utility/commands/ping.js');
        const interaction = fakePingInteraction();
        await mod.default.execute(interaction as never);
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const call = interaction.editReply.mock.calls.at(0)?.at(0) as unknown as { embeds: { toJSON: () => Record<string, unknown> }[] | undefined };
        const embed = call.embeds?.at(0);
        expect(embed).toBeDefined();
        const json = (embed as unknown as { toJSON: () => Record<string, unknown> }).toJSON();
        expect(json['title']).toBe('Pong!');
        const fields = json['fields'] as { name: string; value: string }[];
        expect(fields.map((f) => f.name)).toContain('Round-Trip Latency');
    });

    it('DM interaction with de locale renders German ping embed', async () => {
        const mod = await import('../src/plugins/utility/commands/ping.js');
        const interaction = fakePingInteraction({ guildId: null, guild: null, locale: 'de', guildLocale: null });
        await mod.default.execute(interaction as never);
        expect(interaction.editReply).toHaveBeenCalledTimes(1);
        const call = interaction.editReply.mock.calls.at(0)?.at(0) as unknown as { embeds: { toJSON: () => Record<string, unknown> }[] | undefined };
        const embed = call.embeds?.at(0);
        expect(embed).toBeDefined();
        const json = (embed as unknown as { toJSON: () => Record<string, unknown> }).toJSON();
        const fields = json['fields'] as { name: string; value: string }[];
        expect(fields.map((f) => f.name)).toContain('Round-Trip Latency');
        expect(json['footer']).toMatchObject({ text: expect.stringContaining('Requested by') });
    });

    it('getFixedT resolves the utility namespace per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('es-ES', 'utility')('ping.response')).toBe('Pong!');
        expect(i18n.getFixedT('de', 'utility')('ping.roundTrip')).toBe('Round-Trip Latency');
        expect(i18n.getFixedT('en-US', 'utility')('ping.response')).toBe('Pong!');
    });

    it('builder-style serverinfo payload carries description_localizations', async () => {
        const mod = await import('../src/plugins/utility/commands/serverinfo.js');
        const json = mod.default.data.toJSON() as { description_localizations?: Record<string, string>; name_localizations?: Record<string, string> };
        expect(json.description_localizations?.['es-ES']).toBe('Muestra información sobre el servidor');
        expect(json.description_localizations?.['de']).toBe('Zeigt Informationen über den Server');
        expect(json.name_localizations?.['es-ES']).toBe('infoservidor');
    });
});
