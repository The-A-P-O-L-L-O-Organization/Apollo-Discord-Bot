import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async (store: string, guildId: string) => {
        if (store === 'settings' && guildId === 'g-es') {
            return { locale: 'es-ES' };
        }
        if (store === 'settings' && guildId === 'g-de') {
            return { locale: 'de' };
        }
        return {};
    }),
    getData: vi.fn(async () => ({})),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({})),
    setGuildData: vi.fn(async () => undefined)
}));

vi.mock('../src/utils/analyticsCollector.js', () => ({
    trackMemberChange: vi.fn(),
    trackModAction: vi.fn(),
    flushAnalyticsCritical: vi.fn(async () => undefined)
}));

vi.mock('../src/utils/raidDetection.js', () => ({
    checkRaidPattern: vi.fn(async () => false),
    handleRaidDetected: vi.fn(async () => undefined),
    checkRaidPatternRedis: vi.fn(async () => ({ detected: false })),
    trackJoinRedis: vi.fn(async () => undefined)
}));

vi.mock('../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(async () => null)
}));

const logEventMock = vi.fn(async () => undefined);
vi.mock('../src/utils/guildLogging.js', () => ({
    logEvent: logEventMock,
    createMemberJoinEmbed: vi.fn(() => ({})),
    createMemberLeaveEmbed: vi.fn(() => ({}))
}));

vi.mock('../src/utils/modLog.js', () => ({
    sendModLog: vi.fn(async () => undefined),
    fetchMember: vi.fn(async () => null)
}));

function fakeCommandInteraction(locale: string) {
    const reply = vi.fn(async () => undefined);
    return {
        locale,
        guildLocale: locale,
        guildId: null,
        guild: null,
        user: { id: 'u1', tag: 'Tester#0001' },
        client: { user: { id: 'bot1' }, ws: { ping: 42 } },
        options: {
            getUser: vi.fn(() => null),
            getString: vi.fn(() => null),
            getInteger: vi.fn(() => null),
            getBoolean: vi.fn(() => null)
        },
        reply
    };
}

function firstEmbed(reply: unknown): { title: string; description: string } {
    const calls = (reply as { mock: { calls: unknown[][] } }).mock.calls;
    const payload = (calls.at(0) as unknown[]).at(0) as { embeds: { title: string; description: string }[] };
    return payload.embeds.at(0) as { title: string; description: string };
}

function welcomeTitle(send: unknown): unknown {
    const calls = (send as { mock: { calls: unknown[][] } }).mock.calls;
    const payload = (calls.at(0) as unknown[]).at(0) as { embeds: { toJSON: () => Record<string, unknown> }[] };
    return payload.embeds.at(0)?.toJSON()['title'];
}

function fakeJoinMember(guildId: string) {
    const send = vi.fn(async () => undefined);
    const channel = {
        name: 'welcome',
        id: 'ch1',
        isTextBased: () => true,
        permissionsFor: () => ({ has: () => true }),
        send
    };
    const guild = {
        id: guildId,
        name: 'Testville',
        memberCount: 42,
        channels: { cache: { find: () => channel } },
        systemChannel: null,
        roles: { cache: new Map() },
        members: { me: { id: 'bot1' } },
        iconURL: () => null,
        bans: { create: vi.fn(async () => undefined) }
    };
    const member = {
        id: 'u9',
        toString: () => '<@u9>',
        user: {
            id: 'u9',
            bot: false,
            tag: 'Newbie#0001',
            username: 'Newbie',
            createdTimestamp: Date.now() - 365 * 24 * 60 * 60 * 1000,
            displayAvatarURL: () => 'https://example.com/avatar.png',
            send: vi.fn(async () => undefined)
        },
        guild,
        roles: { add: vi.fn(async () => undefined) }
    };
    return { member, guild, channel, send };
}

describe('moderation i18n matrix', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces('moderation');
    });

    it('ban Missing User error renders in en-US', async () => {
        const mod = await import('../src/plugins/moderation/commands/ban.js');
        const interaction = fakeCommandInteraction('en-US');
        await mod.default.execute(interaction as never);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to ban.');
    });

    it('ban Missing User error renders in es-ES', async () => {
        const mod = await import('../src/plugins/moderation/commands/ban.js');
        const interaction = fakeCommandInteraction('es-ES');
        await mod.default.execute(interaction as never);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to ban.');
    });

    it('ban Missing User error renders in de', async () => {
        const mod = await import('../src/plugins/moderation/commands/ban.js');
        const interaction = fakeCommandInteraction('de');
        await mod.default.execute(interaction as never);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to ban.');
    });

    it('kick Missing User error renders in es-ES', async () => {
        const mod = await import('../src/plugins/moderation/commands/kick.js');
        const interaction = fakeCommandInteraction('es-ES');
        await mod.default.execute(interaction as never);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to kick.');
    });

    it('mute Missing User error renders in de', async () => {
        const mod = await import('../src/plugins/moderation/commands/mute.js');
        const interaction = fakeCommandInteraction('de');
        await mod.default.execute(interaction as never);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to mute.');
    });

    it('warn Missing User error renders in es-ES', async () => {
        const mod = await import('../src/plugins/moderation/commands/warn.js');
        const interaction = fakeCommandInteraction('es-ES');
        await mod.default.execute(interaction as never);
        const embed = firstEmbed(interaction.reply);
        expect(embed.title).toBe('[ERROR] Missing User');
        expect(embed.description).toBe('Please specify a valid user to warn.');
    });

    it('getFixedT resolves the moderation namespace per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'moderation')('ban.missingUserDescription')).toBe('Please specify a valid user to ban.');
        expect(i18n.getFixedT('es-ES', 'moderation')('ban.missingUserDescription')).toBe('Please specify a valid user to ban.');
        expect(i18n.getFixedT('de', 'moderation')('ban.missingUserDescription')).toBe('Please specify a valid user to ban.');
        expect(i18n.getFixedT('es-ES', 'moderation')('welcome.title')).toBe('Welcome to the Server!');
        expect(i18n.getFixedT('de', 'moderation')('welcome.title')).toBe('Welcome to the Server!');
    });

    it('welcome message renders in es-ES', async () => {
        const mod = await import('../src/plugins/moderation/events/guildMemberAdd.js');
        const { member, send } = fakeJoinMember('g-es');
        await mod.default.execute(member as never, {} as never);
        expect(send).toHaveBeenCalledTimes(1);
        expect(welcomeTitle(send)).toBe('Welcome to the Server!');
    });

    it('welcome message renders in de', async () => {
        const mod = await import('../src/plugins/moderation/events/guildMemberAdd.js');
        const { member, send } = fakeJoinMember('g-de');
        await mod.default.execute(member as never, {} as never);
        expect(send).toHaveBeenCalledTimes(1);
        expect(welcomeTitle(send)).toBe('Welcome to the Server!');
    });

    it('goodbye handler logs memberLeave without throwing', async () => {
        const mod = await import('../src/plugins/moderation/events/guildMemberRemove.js');
        const { member } = fakeJoinMember('g-es');
        (member as unknown as { roles: unknown }).roles = { cache: { filter: () => ({ map: () => [] }) } };
        logEventMock.mockClear();
        await mod.default.execute(member as never, {} as never);
        expect(logEventMock).toHaveBeenCalledWith(expect.anything(), 'memberLeave', expect.anything());
    });
});
