import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async () => ({})),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({})),
    generateId: vi.fn(() => 'test-id'),
    writeToSubDir: vi.fn(() => undefined),
    getAllGuildIds: vi.fn(async () => [])
}));

vi.mock('../src/utils/slaTracker.js', async (importOriginal) => {
    const orig = await importOriginal() as Record<string, unknown>;
    return {
        ...orig,
        calculateSLAMetrics: vi.fn(async () => ({ avgResponseTime: 0, avgResolutionTime: 0, slaMet: 0, slaBreached: 0, totalTickets: 0, openTicketsBreached: 0 }))
    };
});

vi.mock('../src/utils/transcriptGenerator.js', () => ({
    saveTranscripts: vi.fn(async () => ({ htmlFile: 't.html', textFile: 't.txt' }))
}));

const { getGuildData } = await import('../src/utils/db.js') as unknown as { getGuildData: ReturnType<typeof vi.fn> };

function makeChatInteraction(overrides: Record<string, unknown> = {}) {
    const reply = vi.fn(async () => undefined);
    const editReply = vi.fn(async () => undefined);
    const deferReply = vi.fn(async () => undefined);
    return {
        locale: 'en-US',
        guildLocale: 'en-US',
        guildId: 'g1',
        guild: { id: 'g1', name: 'Test Guild', channels: { fetch: async () => null }, roles: { fetch: async () => null } },
        channel: { id: 'c1' },
        member: { roles: { cache: { has: () => false } }, permissions: { has: () => false } },
        options: { getString: () => null, getInteger: () => null, getUser: () => null, getSubcommand: () => '', getChannel: () => null, getRole: () => null },
        user: { id: 'u1', tag: 'Tester#0001', send: vi.fn(async () => undefined) },
        client: { user: { id: 'bot1' }, users: { fetch: async () => null } },
        reply,
        editReply,
        deferReply,
        replied: false,
        deferred: false,
        ...overrides
    };
}

function makeButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
    const reply = vi.fn(async () => undefined);
    const editReply = vi.fn(async () => undefined);
    const deferReply = vi.fn(async () => undefined);
    return {
        isButton: () => true,
        customId,
        locale: 'en-US',
        guildLocale: 'en-US',
        guildId: 'g1',
        guild: { id: 'g1', name: 'Test Guild' },
        channel: { id: 'c1', messages: { fetch: async () => new Map() } },
        member: { roles: { cache: { has: () => false } }, permissions: { has: () => false } },
        user: { id: 'u1', tag: 'Tester#0001' },
        client: { user: { id: 'bot1' }, users: { fetch: async () => null }, channels: { fetch: async () => null } },
        reply,
        editReply,
        deferReply,
        replied: false,
        deferred: false,
        ...overrides
    };
}

function firstCall(mockFn: { mock: { calls: unknown[][] } }): unknown {
    const calls = mockFn.mock.calls as unknown[][];
    return calls.length > 0 ? calls[0]?.[0] : undefined;
}

function firstEmbedTitle(payload: unknown): unknown {
    const call = payload as unknown as { embeds: { toJSON: () => Record<string, unknown> }[] };
    const embeds = call.embeds as { toJSON: () => Record<string, unknown> }[];
    if (embeds.length === 0) { return undefined; }
    const first = embeds[0] as { toJSON: () => Record<string, unknown> };
    return first.toJSON()['title'];
}

const MATRIX: { key: string; en: string; es: string; de: string }[] = [
    { key: 'ticket.alreadyOpen', en: 'You already have an open ticket', es: 'You already have an open ticket', de: 'You already have an open ticket' },
    { key: 'closeticket.notTicket', en: 'This channel is not a ticket channel.', es: 'This channel is not a ticket channel.', de: 'This channel is not a ticket channel.' },
    { key: 'assign.title', en: 'Ticket Assigned', es: 'Ticket Assigned', de: 'Ticket Assigned' },
    { key: 'ticketadd.title', en: 'User Added to Ticket', es: 'User Added to Ticket', de: 'User Added to Ticket' },
    { key: 'ticketinfo.title', en: 'Ticket #5 Information', es: 'Ticket #5 Information', de: 'Ticket #5 Information' },
    { key: 'ticketlist.title', en: 'Open Tickets', es: 'Open Tickets', de: 'Open Tickets' },
    { key: 'ticketsetup.statusTitle', en: 'Ticket System Configuration', es: 'Ticket System Configuration', de: 'Ticket System Configuration' },
    { key: 'ticketpriority.title', en: 'Ticket Priority Updated', es: 'Ticket Priority Updated', de: 'Ticket Priority Updated' },
    { key: 'ticketstats.title', en: 'Statistics Ticket System Statistics', es: 'Statistics Ticket System Statistics', de: 'Statistics Ticket System Statistics' },
    { key: 'ticketsearch.title', en: 'Search Ticket Search Results', es: 'Search Ticket Search Results', de: 'Search Ticket Search Results' },
    { key: 'ticketratings.overallTitle', en: '★ Overall Rating Statistics', es: '★ Overall Rating Statistics', de: '★ Overall Rating Statistics' },
    { key: 'tickettemplate.listTitle', en: 'Ticket Templates', es: 'Ticket Templates', de: 'Ticket Templates' },
    { key: 'tickettransfer.title', en: 'Ticket Transferred', es: 'Ticket Transferred', de: 'Ticket Transferred' },
    { key: 'panel.footer', en: 'Use the button below or /closeticket', es: 'Use the button below or /closeticket', de: 'Use the button below or /closeticket' }
];

describe('tickets i18n matrix', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces('tickets');
    });

    for (const row of MATRIX) {
        it(`${row.key} renders en-US / es-ES / de`, async () => {
            const { i18n } = await import('../src/i18n/index.js');
            const vars = row.key === 'ticketinfo.title' ? { number: 5 } : row.key === 'ticket.alreadyOpen' ? { channelId: 'c1' } : {};
            expect(i18n.getFixedT('en-US', 'tickets')(row.key, vars)).toContain(row.en);
            expect(i18n.getFixedT('es-ES', 'tickets')(row.key, vars)).toContain(row.es);
            expect(i18n.getFixedT('de', 'tickets')(row.key, vars)).toContain(row.de);
        });
    }

    it('ticket execute replies already-open in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [{ userId: 'u1', channelId: 'c1' }] });
        const mod = await import('../src/plugins/tickets/commands/ticket.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES' });
        await mod.default.execute(interaction as never);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('You already have an open ticket') });
    });

    it('ticket execute replies already-open in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [{ userId: 'u1', channelId: 'c1' }] });
        const mod = await import('../src/plugins/tickets/commands/ticket.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de' });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('You already have an open ticket') });
    });

    it('closeticket execute replies not-a-ticket in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/closeticket.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de' });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('This channel is not a ticket channel.') });
    });

    it('assign execute replies not-a-ticket in English', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/assign.js');
        const interaction = makeChatInteraction({ options: { getUser: () => ({ id: 'u2' }) } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('This channel is not a ticket channel.') });
    });

    it('ticketadd execute replies no-permission in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [{ userId: 'u9', channelId: 'c1' }] });
        const mod = await import('../src/plugins/tickets/commands/ticketadd.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getUser: () => ({ id: 'u2' }) } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('You do not have permission to add users') });
    });

    it('ticketinfo execute replies not-found in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [], closedTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/ticketinfo.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de', options: { getInteger: () => 99 } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('Ticket #99 not found.') });
    });

    it('ticketlist execute replies empty in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/ticketlist.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getString: () => null } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.editReply)).toMatchObject({ content: expect.stringContaining('There are no open tickets at the moment.') });
    });

    it('ticketpriority execute replies not-a-ticket in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/ticketpriority.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getString: () => 'high' } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('This channel is not a ticket channel.') });
    });

    it('tickettransfer execute replies not-a-ticket in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/tickettransfer.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de', options: { getUser: () => ({ id: 'u2' }), getString: () => null } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('This channel is not a ticket channel.') });
    });

    it('ticketsetup status renders localized title in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({});
        const mod = await import('../src/plugins/tickets/commands/ticketsetup.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getSubcommand: () => 'status' } });
        await mod.default.execute(interaction as never);
        expect(firstEmbedTitle(firstCall(interaction.reply))).toBe('Ticket System Configuration');
    });

    it('ticketstats renders localized title in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [], closedTickets: [], totalTickets: 0 });
        const mod = await import('../src/plugins/tickets/commands/ticketstats.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de' });
        await mod.default.execute(interaction as never);
        expect(firstEmbedTitle(firstCall(interaction.editReply))).toBe('Statistics Ticket System Statistics');
    });

    it('ticketsearch replies no-results in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [], closedTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/ticketsearch.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getSubcommand: () => 'number', getInteger: () => 999, getString: () => null, getUser: () => null } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.editReply)).toMatchObject({ content: expect.stringContaining('No tickets found matching your search criteria.') });
    });

    it('ticketratings overall replies unrated in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ closedTickets: [] });
        const mod = await import('../src/plugins/tickets/commands/ticketratings.js');
        const interaction = makeChatInteraction({ locale: 'de', guildLocale: 'de', options: { getSubcommand: () => 'overall', getUser: () => null, getString: () => null } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.editReply)).toMatchObject({ content: expect.stringContaining('none have been rated yet') });
    });

    it('tickettemplate list replies empty in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ list: [] });
        const mod = await import('../src/plugins/tickets/commands/tickettemplate.js');
        const interaction = makeChatInteraction({ locale: 'es-ES', guildLocale: 'es-ES', options: { getSubcommand: () => 'list', getString: () => null } });
        await mod.default.execute(interaction as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('No templates have been created yet') });
    });

    it('interactionCreate close_ticket replies not-a-ticket in Spanish', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [] });
        const mod = await import('../src/plugins/tickets/events/interactionCreate.js');
        const interaction = makeButtonInteraction('close_ticket', { locale: 'es-ES', guildLocale: 'es-ES' });
        await mod.default.execute(interaction as never, {} as never);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('This channel is not a ticket channel.') });
    });

    it('interactionCreate create_ticket replies already-open in German', async () => {
        getGuildData.mockReset();
        getGuildData.mockResolvedValue({ openTickets: [{ userId: 'u1', channelId: 'c1' }] });
        const mod = await import('../src/plugins/tickets/events/interactionCreate.js');
        const interaction = makeButtonInteraction('create_ticket', { locale: 'de', guildLocale: 'de' });
        await mod.default.execute(interaction as never, {} as never);
        expect(firstCall(interaction.reply)).toMatchObject({ content: expect.stringContaining('You already have an open ticket') });
    });
});
