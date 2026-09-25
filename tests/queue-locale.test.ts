import { describe, it, expect } from 'vitest';
import { encode, decode } from 'msgpackr';
import { serializeInteraction } from '../src/queue/serializeInteraction.js';
import RemoteInteraction from '../src/queue/remoteInteraction.js';

describe('queue locale round-trip', () => {
    it('preserves resolvedLocale through serialize, codec, and reconstruct', async () => {
        const live = {
            id: '1',
            commandId: 'c1',
            commandName: 'ping',
            createdTimestamp: Date.now(),
            channelId: 'ch1',
            guildId: 'g1',
            token: 't',
            user: { id: 'u1', username: 'tester' },
            options: { data: [] },
            locale: 'es-ES',
            guildLocale: 'es-ES',
            resolvedLocale: 'es-ES'
        };
        const mockRest = {};
        const serialized = serializeInteraction(live);
        const remote = new RemoteInteraction(decode(encode(serialized)), mockRest as never, {});
        expect(remote.locale).toBe('es-ES');
        expect(remote.resolvedLocale).toBe('es-ES');
    });
});
