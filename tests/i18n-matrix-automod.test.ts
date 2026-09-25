import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async (_store: string, guildId: string) => {
        if (guildId === 'g-es') {
            return { locale: 'es-ES' };
        }
        if (guildId === 'g-de') {
            return { locale: 'de' };
        }
        return {};
    }),
    setGuildData: vi.fn(async () => undefined)
}));

function fakeAutomodInteraction(subcommand: string, guildId: string, locale: string) {
    const reply = vi.fn(async () => undefined);
    return {
        options: { getSubcommand: () => subcommand },
        guild: { id: guildId, name: 'Test Guild' },
        guildId,
        locale,
        guildLocale: locale,
        reply
    };
}

describe('automod i18n matrix', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces('automod');
    });

    it('enable title renders per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'automod')('enable.title')).toBe('Automod Enabled');
        expect(i18n.getFixedT('es-ES', 'automod')('enable.title')).toBe('Automod Enabled');
        expect(i18n.getFixedT('de', 'automod')('enable.title')).toBe('Automod Enabled');
    });

    it('status title renders per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'automod')('status.title')).toBe('Automod Configuration');
        expect(i18n.getFixedT('es-ES', 'automod')('status.title')).toBe('Automod Configuration');
        expect(i18n.getFixedT('de', 'automod')('status.title')).toBe('Automod Configuration');
    });

    it('violation warning renders per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'automod')('violation.title')).toBe('[!] Automod Warning');
        expect(i18n.getFixedT('es-ES', 'automod')('violation.title')).toBe('[!] Automod Warning');
        expect(i18n.getFixedT('de', 'automod')('violation.title')).toBe('[!] Automod Warning');
    });

    it('enable execute renders Spanish embed for stored es-ES guild', async () => {
        const mod = await import('../src/plugins/automod/commands/automod.js');
        const interaction = fakeAutomodInteraction('enable', 'g-es', 'es-ES');
        await mod.default.execute(interaction as never);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const arg = interaction.reply.mock.calls.at(0)?.at(0) as unknown as { embeds: { toJSON: () => Record<string, unknown> }[] };
        const embed = arg.embeds.at(0);
        expect(embed).toBeDefined();
        const json = (embed as unknown as { toJSON: () => Record<string, unknown> }).toJSON();
        expect(json['title']).toBe('Automod Enabled');
    });

    it('status execute renders German embed for stored de guild', async () => {
        const mod = await import('../src/plugins/automod/commands/automod.js');
        const interaction = fakeAutomodInteraction('status', 'g-de', 'de');
        await mod.default.execute(interaction as never);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const arg = interaction.reply.mock.calls.at(0)?.at(0) as unknown as { embeds: { toJSON: () => Record<string, unknown> }[] };
        const embed = arg.embeds.at(0);
        expect(embed).toBeDefined();
        const json = (embed as unknown as { toJSON: () => Record<string, unknown> }).toJSON();
        expect(json['title']).toBe('Automod Configuration');
    });
});
