import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async () => ({})),
    setGuildData: vi.fn(async () => undefined),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({})),
    getData: vi.fn(async () => ({ nextId: 1, subscriptions: [] })),
    setData: vi.fn(async () => undefined)
}));

function fakeStringInteraction(locale: string, value: string | null, optionName: string) {
    const reply = vi.fn(async () => undefined);
    return {
        interaction: {
            locale,
            guildLocale: null,
            guildId: null,
            options: { getString: () => value, getSubcommand: () => undefined },
            user: { id: 'u1', tag: 'Tester#0001', displayAvatarURL: () => 'https://example.com/a.png' },
            reply,
            replied: false,
            deferred: false,
            optionName
        },
        reply
    };
}

function replyEmbedTitle(reply: { mock: { calls: unknown[][] } }): string | undefined {
    const call = reply.mock.calls.at(0)?.at(0) as { embeds?: { toJSON?: () => Record<string, unknown>; title?: string }[] } | undefined;
    const embed = call?.embeds?.at(0);
    if (!embed) {
        return undefined;
    }
    if (typeof embed.toJSON === 'function') {
        return embed.toJSON()['title'] as string | undefined;
    }
    return embed['title'];
}

describe('i18n matrix utility remainder', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces('utility');
    });

    it('userinfo avatar channelinfo roleinfo banner stats keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('userinfo.username')).toBe('Username');
        expect(i18n.getFixedT('es-ES', 'utility')('userinfo.username')).toBe('Username');
        expect(i18n.getFixedT('de', 'utility')('userinfo.username')).toBe('Username');
        expect(i18n.getFixedT('en-US', 'utility')('avatar.global')).toBe('Global Avatar');
        expect(i18n.getFixedT('es-ES', 'utility')('avatar.global')).toBe('Global Avatar');
        expect(i18n.getFixedT('de', 'utility')('avatar.global')).toBe('Global Avatar');
        expect(i18n.getFixedT('en-US', 'utility')('channelinfo.type')).toBe('Type');
        expect(i18n.getFixedT('es-ES', 'utility')('channelinfo.type')).toBe('Type');
        expect(i18n.getFixedT('de', 'utility')('channelinfo.type')).toBe('Type');
        expect(i18n.getFixedT('en-US', 'utility')('roleinfo.members')).toBe('Members');
        expect(i18n.getFixedT('es-ES', 'utility')('roleinfo.members')).toBe('Members');
        expect(i18n.getFixedT('de', 'utility')('roleinfo.members')).toBe('Members');
        expect(i18n.getFixedT('en-US', 'utility')('banner.noBannerTitle')).toBe('No Banner');
        expect(i18n.getFixedT('es-ES', 'utility')('banner.noBannerTitle')).toBe('No Banner');
        expect(i18n.getFixedT('de', 'utility')('banner.noBannerTitle')).toBe('No Banner');
        expect(i18n.getFixedT('en-US', 'utility')('stats.title')).toBe('Bot Statistics');
        expect(i18n.getFixedT('es-ES', 'utility')('stats.title')).toBe('Bot Statistics');
        expect(i18n.getFixedT('de', 'utility')('stats.title')).toBe('Bot Statistics');
    });

    it('eightball joke roll embed keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('eightball.title')).toBe('Magic 8-Ball');
        expect(i18n.getFixedT('es-ES', 'utility')('eightball.title')).toBe('Magic 8-Ball');
        expect(i18n.getFixedT('de', 'utility')('eightball.title')).toBe('Magic 8-Ball');
        expect(i18n.getFixedT('en-US', 'utility')('joke.title')).toBe('Random Joke');
        expect(i18n.getFixedT('es-ES', 'utility')('joke.title')).toBe('Random Joke');
        expect(i18n.getFixedT('de', 'utility')('joke.title')).toBe('Random Joke');
        expect(i18n.getFixedT('en-US', 'utility')('roll.title')).toBe('Dice Roll');
        expect(i18n.getFixedT('es-ES', 'utility')('roll.title')).toBe('Dice Roll');
        expect(i18n.getFixedT('de', 'utility')('roll.title')).toBe('Dice Roll');
        expect(i18n.getFixedT('en-US', 'utility')('embed.created')).toBe('Embed created successfully!');
        expect(i18n.getFixedT('es-ES', 'utility')('embed.created')).toBe('Embed created successfully!');
        expect(i18n.getFixedT('de', 'utility')('embed.created')).toBe('Embed created successfully!');
    });

    it('level leaderboard remind poll keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('level.level')).toBe('Level');
        expect(i18n.getFixedT('es-ES', 'utility')('level.level')).toBe('Level');
        expect(i18n.getFixedT('de', 'utility')('level.level')).toBe('Level');
        expect(i18n.getFixedT('en-US', 'utility')('leaderboard.noDataTitle')).toBe('No Data');
        expect(i18n.getFixedT('es-ES', 'utility')('leaderboard.noDataTitle')).toBe('No Data');
        expect(i18n.getFixedT('de', 'utility')('leaderboard.noDataTitle')).toBe('No Data');
        expect(i18n.getFixedT('en-US', 'utility')('remind.tooLong', { days: 30 })).toBe('Reminder duration cannot exceed 30 days.');
        expect(i18n.getFixedT('es-ES', 'utility')('remind.tooLong', { days: 30 })).toBe('Reminder duration cannot exceed 30 days.');
        expect(i18n.getFixedT('de', 'utility')('remind.tooLong', { days: 30 })).toBe('Reminder duration cannot exceed 30 days.');
        expect(i18n.getFixedT('en-US', 'utility')('poll.ends')).toBe('Poll Ends');
        expect(i18n.getFixedT('es-ES', 'utility')('poll.ends')).toBe('Poll Ends');
        expect(i18n.getFixedT('de', 'utility')('poll.ends')).toBe('Poll Ends');
    });

    it('analytics tag translate giveaway report keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('analytics.noData')).toBe('No data');
        expect(i18n.getFixedT('es-ES', 'utility')('analytics.noData')).toBe('No data');
        expect(i18n.getFixedT('de', 'utility')('analytics.noData')).toBe('No data');
        expect(i18n.getFixedT('en-US', 'utility')('tag.notFound', { name: 'foo' })).toBe('Tag "foo" does not exist.');
        expect(i18n.getFixedT('es-ES', 'utility')('tag.notFound', { name: 'foo' })).toBe('Tag "foo" does not exist.');
        expect(i18n.getFixedT('de', 'utility')('tag.notFound', { name: 'foo' })).toBe('Tag "foo" does not exist.');
        expect(i18n.getFixedT('en-US', 'utility')('translate.failed')).toBe('Translation failed. Please try again.');
        expect(i18n.getFixedT('es-ES', 'utility')('translate.failed')).toBe('Translation failed. Please try again.');
        expect(i18n.getFixedT('de', 'utility')('translate.failed')).toBe('Translation failed. Please try again.');
        expect(i18n.getFixedT('en-US', 'utility')('giveaway.title')).toBe('GIVEAWAY');
        expect(i18n.getFixedT('es-ES', 'utility')('giveaway.title')).toBe('GIVEAWAY');
        expect(i18n.getFixedT('de', 'utility')('giveaway.title')).toBe('GIVEAWAY');
        expect(i18n.getFixedT('en-US', 'utility')('report.modalTitle')).toBe('Report Message');
        expect(i18n.getFixedT('es-ES', 'utility')('report.modalTitle')).toBe('Report Message');
        expect(i18n.getFixedT('de', 'utility')('report.modalTitle')).toBe('Report Message');
    });

    it('sla reminders cancelreminder datadeletion operatorcontact keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('sla.title')).toBe('SLA Metrics & Response Times');
        expect(i18n.getFixedT('es-ES', 'utility')('sla.title')).toBe('SLA Metrics & Response Times');
        expect(i18n.getFixedT('de', 'utility')('sla.title')).toBe('SLA Metrics & Response Times');
        expect(i18n.getFixedT('en-US', 'utility')('reminders.title')).toBe('Your Reminders');
        expect(i18n.getFixedT('es-ES', 'utility')('reminders.title')).toBe('Your Reminders');
        expect(i18n.getFixedT('de', 'utility')('reminders.title')).toBe('Your Reminders');
        expect(i18n.getFixedT('en-US', 'utility')('cancelreminder.cancelled', { message: 'hi' })).toBe('Reminder cancelled!\n\n**Message:** hi');
        expect(i18n.getFixedT('es-ES', 'utility')('cancelreminder.cancelled', { message: 'hi' })).toBe('Reminder cancelled!\n\n**Message:** hi');
        expect(i18n.getFixedT('de', 'utility')('cancelreminder.cancelled', { message: 'hi' })).toBe('Reminder cancelled!\n\n**Message:** hi');
        expect(i18n.getFixedT('en-US', 'utility')('datadeletion.confirmTitle')).toBe('Data Deletion Request');
        expect(i18n.getFixedT('es-ES', 'utility')('datadeletion.confirmTitle')).toBe('Data Deletion Request');
        expect(i18n.getFixedT('de', 'utility')('datadeletion.confirmTitle')).toBe('Data Deletion Request');
        expect(i18n.getFixedT('en-US', 'utility')('operatorcontact.title')).toBe('Operator Contact');
        expect(i18n.getFixedT('es-ES', 'utility')('operatorcontact.title')).toBe('Operator Contact');
        expect(i18n.getFixedT('de', 'utility')('operatorcontact.title')).toBe('Operator Contact');
    });

    it('invite apollo apolloActions announcement levelup keys render per locale', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'utility')('invite.botTitle')).toBe('Bot Invite Link');
        expect(i18n.getFixedT('es-ES', 'utility')('invite.botTitle')).toBe('Bot Invite Link');
        expect(i18n.getFixedT('de', 'utility')('invite.botTitle')).toBe('Bot Invite Link');
        expect(i18n.getFixedT('en-US', 'utility')('apollo.infoTitle')).toBe('The A.P.O.L.L.O Organization');
        expect(i18n.getFixedT('es-ES', 'utility')('apollo.infoTitle')).toBe('The A.P.O.L.L.O Organization');
        expect(i18n.getFixedT('de', 'utility')('apollo.infoTitle')).toBe('The A.P.O.L.L.O Organization');
        expect(i18n.getFixedT('en-US', 'utility')('apolloActions.deniedTitle')).toBe('Access Denied');
        expect(i18n.getFixedT('es-ES', 'utility')('apolloActions.deniedTitle')).toBe('Access Denied');
        expect(i18n.getFixedT('de', 'utility')('apolloActions.deniedTitle')).toBe('Access Denied');
        expect(i18n.getFixedT('en-US', 'utility')('announcement.scheduledTitle')).toBe('Announcement Scheduled');
        expect(i18n.getFixedT('es-ES', 'utility')('announcement.scheduledTitle')).toBe('Announcement Scheduled');
        expect(i18n.getFixedT('de', 'utility')('announcement.scheduledTitle')).toBe('Announcement Scheduled');
        expect(i18n.getFixedT('en-US', 'utility')('levelup.title')).toBe('LEVEL UP');
        expect(i18n.getFixedT('es-ES', 'utility')('levelup.title')).toBe('LEVEL UP');
        expect(i18n.getFixedT('de', 'utility')('levelup.title')).toBe('LEVEL UP');
        expect(i18n.getFixedT('de', 'utility')('levelup.description', { mention: '<@u1>', level: 5 })).toBe('<@u1> reached level **5**!');
    });

    it('8ball execute renders localized embed per locale', async () => {
        const mod = await import('../src/plugins/utility/commands/8ball.js');
        const es = fakeStringInteraction('es-ES', 'Will it rain?', 'question');
        await mod.default.execute(es.interaction as never);
        const esCall = es.reply.mock.calls.at(0)?.at(0) as { embeds?: { title?: string }[] } | undefined;
        expect(esCall?.embeds?.at(0)?.title).toBe('Magic 8-Ball');
        const de = fakeStringInteraction('de', 'Wird es regnen?', 'question');
        await mod.default.execute(de.interaction as never);
        const deCall = de.reply.mock.calls.at(0)?.at(0) as { embeds?: { title?: string }[] } | undefined;
        expect(deCall?.embeds?.at(0)?.title).toBe('Magic 8-Ball');
        const en = fakeStringInteraction('en-US', 'Will it rain?', 'question');
        await mod.default.execute(en.interaction as never);
        const enCall = en.reply.mock.calls.at(0)?.at(0) as { embeds?: { title?: string }[] } | undefined;
        expect(enCall?.embeds?.at(0)?.title).toBe('Magic 8-Ball');
    });

    it('roll execute renders localized invalid dice error per locale', async () => {
        const mod = await import('../src/plugins/utility/commands/roll.js');
        const de = fakeStringInteraction('de', 'bogus', 'dice');
        await mod.default.execute(de.interaction as never);
        expect(replyEmbedTitle(de.reply)).toBe('Invalid Dice');
        const es = fakeStringInteraction('es-ES', 'bogus', 'dice');
        await mod.default.execute(es.interaction as never);
        expect(replyEmbedTitle(es.reply)).toBe('Invalid Dice');
        const en = fakeStringInteraction('en-US', 'bogus', 'dice');
        await mod.default.execute(en.interaction as never);
        expect(replyEmbedTitle(en.reply)).toBe('Invalid Dice');
    });
});
