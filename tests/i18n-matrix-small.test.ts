import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../src/utils/db.js', () => ({
    getGuildData: vi.fn(async () => ({})),
    setGuildData: vi.fn(async () => undefined),
    updateGuildData: vi.fn(async (_store: string, _guildId: string, updater: (cur: Record<string, unknown>) => Record<string, unknown>) => updater({})),
    getData: vi.fn(async () => ({ nextId: 1, subscriptions: [] })),
    setData: vi.fn(async () => undefined)
}));

function viewInteraction(locale: string) {
    const reply = vi.fn(async () => undefined);
    return {
        interaction: {
            locale,
            guildLocale: locale,
            guildId: 'g-small',
            guild: { id: 'g-small' },
            options: { getSubcommand: () => 'view' },
            reply,
            replied: false,
            deferred: false
        },
        reply
    };
}

function listInteraction(locale: string) {
    const reply = vi.fn(async () => undefined);
    return {
        interaction: {
            locale,
            guildLocale: locale,
            guildId: 'g-small',
            options: { getSubcommand: () => 'list' },
            reply,
            replied: false,
            deferred: false
        },
        reply
    };
}

function firstReplyContent(reply: { mock: { calls: unknown[][] } }): string | undefined {
    const call = reply.mock.calls.at(0)?.at(0) as { content?: string } | undefined;
    return call?.content;
}

describe('i18n matrix small plugins plus shared choke points', () => {
    beforeAll(async () => {
        const { i18n } = await import('../src/i18n/index.js');
        await i18n.init();
        await i18n.loadNamespaces(['admin', 'integrations', 'interlink']);
    });

    it('admin setlogchannel view renders per locale', async () => {
        const mod = await import('../src/plugins/admin/commands/setlogchannel.js');
        const en = viewInteraction('en-US');
        await mod.default.execute(en.interaction as never);
        expect(firstReplyContent(en.reply)).toBe('No logging channel is currently set.\n\nUse `/setlogchannel set` to configure one.');
        const es = viewInteraction('es-ES');
        await mod.default.execute(es.interaction as never);
        expect(firstReplyContent(es.reply)).toBe('No logging channel is currently set.\n\nUse `/setlogchannel set` to configure one.');
        const de = viewInteraction('de');
        await mod.default.execute(de.interaction as never);
        expect(firstReplyContent(de.reply)).toBe('No logging channel is currently set.\n\nUse `/setlogchannel set` to configure one.');
    });

    it('admin namespace resolves logging queue reactionrole migrate system plugin keys', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('es-ES', 'admin')('logging.statusTitle')).toBe('Logging Configuration');
        expect(i18n.getFixedT('de', 'admin')('logging.statusTitle')).toBe('Logging Configuration');
        expect(i18n.getFixedT('en-US', 'admin')('queue.title', { prefix: 'apollo' })).toBe('Queue Status (apollo)');
        expect(i18n.getFixedT('es-ES', 'admin')('queue.title', { prefix: 'apollo' })).toBe('Queue Status (apollo)');
        expect(i18n.getFixedT('de', 'admin')('reactionrole.noneConfigured')).toBe('No reaction roles are configured in this server.');
        expect(i18n.getFixedT('es-ES', 'admin')('migrate.appliedTitle')).toBe('[SUCCESS] Migrations Applied');
        expect(i18n.getFixedT('de', 'admin')('system.title')).toBe('System Status');
        expect(i18n.getFixedT('es-ES', 'admin')('plugin.enabledDescription', { name: 'utility' })).toBe('**utility** has been enabled.');
    });

    it('integrations list renders per locale', async () => {
        const mod = await import('../src/plugins/integrations/commands/integration.js');
        const en = listInteraction('en-US');
        await mod.default.execute(en.interaction as never);
        expect(firstReplyContent(en.reply)).toBe('No integrations configured.');
        const es = listInteraction('es-ES');
        await mod.default.execute(es.interaction as never);
        expect(firstReplyContent(es.reply)).toBe('No integrations configured.');
        const de = listInteraction('de');
        await mod.default.execute(de.interaction as never);
        expect(firstReplyContent(de.reply)).toBe('No integrations configured.');
    });

    it('integrations namespace resolves add remove title keys', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'integrations')('integration.title')).toBe('Integration Subscriptions');
        expect(i18n.getFixedT('es-ES', 'integrations')('integration.notFound', { id: 7 })).toBe('[ERROR] Subscription `7` not found.');
        expect(i18n.getFixedT('de', 'integrations')('integration.removed', { id: 7 })).toBe('[OK] Removed subscription `7`.');
    });

    it('interlink namespace resolves user facing keys', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.getFixedT('en-US', 'interlink')('interlink.accessDenied')).toBe('Only bot owners can use this command.');
        expect(i18n.getFixedT('es-ES', 'interlink')('interlink.accessDenied')).toBe('Only bot owners can use this command.');
        expect(i18n.getFixedT('de', 'interlink')('interlink.accessDenied')).toBe('Only bot owners can use this command.');
        expect(i18n.getFixedT('en-US', 'interlink')('interlink.noBotsTitle')).toBe('[WARNING] No Bots');
        expect(i18n.getFixedT('de', 'interlink')('interlink.registeredTitle')).toBe('[SUCCESS] Bot Registered');
        expect(i18n.getFixedT('es-ES', 'interlink')('interlink.invalidJson')).toBe('payload must be a valid JSON string.');
    });

    it('shared handleDiscordError localizes known codes and fallbacks', async () => {
        const { handleDiscordError } = await import('../src/utils/discordErrors.js');
        expect(handleDiscordError({ code: 50013 })).toBe('I lack the required permissions to perform this action.');
        expect(handleDiscordError({ code: 50013 }, { locale: 'es-ES' })).toBe('I lack the required permissions to perform this action.');
        expect(handleDiscordError({ code: 50013 }, { locale: 'de' })).toBe('I lack the required permissions to perform this action.');
        expect(handleDiscordError(null, { locale: 'de' })).toBe('An unexpected error occurred.');
        expect(handleDiscordError({ code: 99999, message: 'boom' }, { locale: 'es-ES' })).toBe('Discord API error (99999): boom');
    });

    it('shared createErrorEmbed safeReply safeFollowUp carry locale titles', async () => {
        const { createErrorEmbed, safeReply, safeFollowUp } = await import('../src/utils/discordErrors.js');
        expect(createErrorEmbed('x').toJSON().title).toBe('Error');
        expect(createErrorEmbed('x', undefined, 'de').toJSON().title).toBe('Error');
        const reply = vi.fn(async () => undefined);
        await safeReply({ locale: 'de', guildLocale: 'de', guildId: null, replied: false, deferred: false, reply } as never, 'boom');
        const sentCall = reply.mock.calls.at(0)?.at(0) as { embeds: { toJSON: () => Record<string, unknown> }[] } | undefined;
        const sent = sentCall?.embeds.at(0)?.toJSON() as { title?: string; description?: string } | undefined;
        expect(sent?.title).toBe('Error');
        expect(sent?.description).toBe('boom');
        const followUp = vi.fn(async () => undefined);
        await safeFollowUp({ locale: 'es-ES', guildLocale: 'es-ES', guildId: null, replied: true, deferred: false, followUp } as never, 'hola');
        const sentFollowCall = followUp.mock.calls.at(0)?.at(0) as { embeds: { toJSON: () => Record<string, unknown> }[] } | undefined;
        const sentFollow = sentFollowCall?.embeds.at(0)?.toJSON() as { title?: string; description?: string } | undefined;
        expect(sentFollow?.title).toBe('Error');
        expect(sentFollow?.description).toBe('hola');
    });

    it('shared guildLogging embeds render per locale', async () => {
        const { createMessageDeleteEmbed, createMemberJoinEmbed } = await import('../src/utils/guildLogging.js');
        const message = {
            content: 'hello',
            author: { tag: 'T#1', id: 'u1', displayAvatarURL: () => 'https://example.com/a.png' },
            channel: { id: 'c1' },
            id: 'm1',
            attachments: { size: 0, values: () => [].values() }
        };
        expect(createMessageDeleteEmbed(message as never, 'es-ES').toJSON().title).toBe('[Delete] Message Deleted');
        expect(createMessageDeleteEmbed(message as never, 'de').toJSON().title).toBe('[Delete] Message Deleted');
        const member = {
            id: 'u1',
            user: { tag: 'T#1', createdTimestamp: Date.now() - 30 * 86400000, displayAvatarURL: () => 'https://example.com/a.png' },
            guild: { memberCount: 42 }
        };
        expect(createMemberJoinEmbed(member as never, 'de').toJSON().title).toBe('[Join] Member Joined');
        expect(createMemberJoinEmbed(member as never, 'es-ES').toJSON().title).toBe('[Join] Member Joined');
    });

    it('shared sendModLog localizes title and default reason', async () => {
        const { sendModLog, logLocaleChange } = await import('../src/utils/modLog.js');
        const send = vi.fn(async () => undefined);
        const guild = {
            name: 'G',
            iconURL: () => null,
            channels: { cache: { find: () => ({ send }) } }
        };
        await sendModLog(guild as never, {
            action: 'ban',
            target: { tag: 'T#1', id: 'u1', displayAvatarURL: () => null },
            moderator: { tag: 'M#1', id: 'u2' },
            reason: ''
        }, 'es-ES');
        expect(send).toHaveBeenCalledTimes(1);
        const payload = send.mock.calls.at(0)?.at(0) as { embeds: { toJSON: () => Record<string, unknown> }[] } | undefined;
        const embed = payload?.embeds.at(0)?.toJSON() as { title?: string; fields?: { name: string; value: string }[] } | undefined;
        expect(embed?.title).toBe('[MODERATION] BAN');
        const reasonField = embed?.fields?.find((f: { name: string; value: string }) => f.name === 'Reason');
        expect(reasonField?.value).toBe('No reason provided');
        expect(logLocaleChange({ guildId: 'g1', actor: { id: 'u2', tag: 'M#1' }, oldLocale: 'en-US', newLocale: 'de' }, 'de')).toBeUndefined();
    });

    it('shared config fallback templates resolve per locale', async () => {
        const { getWelcomeMessage, getDefaultReason, getTicketWelcomeMessage } = await import('../src/config/config.js');
        expect(getWelcomeMessage('es-ES')).toContain('Welcome');
        expect(getWelcomeMessage('es-ES')).toContain('{user}');
        expect(getWelcomeMessage('xx-YY')).toBe(getWelcomeMessage('en-US'));
        expect(getDefaultReason('de')).toBe('No reason provided');
        expect(getDefaultReason('es-ES')).toBe('No reason provided');
        expect(getTicketWelcomeMessage('es-ES')).toBe('Thanks for opening a ticket! A staff member will be with you shortly.');
    });
});
