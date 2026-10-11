import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(),
    closeLockRedis: vi.fn()
}));

vi.mock('../../src/utils/guildLogging.js', () => ({
    logEvent: vi.fn(),
    createMessageDeleteEmbed: vi.fn(),
    createRoleChangeEmbed: vi.fn(),
    createVoiceChangeEmbed: vi.fn()
}));

import { getLockRedis } from '../../src/utils/lock.js';
import { logEvent, createMessageDeleteEmbed } from '../../src/utils/guildLogging.js';
import { resetSharedEventDedupe } from '../../src/utils/eventDedupe.js';
import messageDeleteHandler from '../../src/plugins/admin/events/messageDelete.js';

function createFakeRedis() {
    const seen = new Set<string>();
    const checkAndSet = async (_script: string, _n: number, key: string) => {
        if (seen.has(key)) {
            return 0;
        }
        seen.add(key);
        return 1;
    };
    return {
        script: vi.fn(async () => 'fakesha'),
        eval: vi.fn(checkAndSet),
        evalsha: vi.fn(checkAndSet),
        quit: vi.fn(async () => undefined)
    };
}

function createMessage(id: string) {
    return {
        id,
        guild: { id: 'guild-1' },
        author: { bot: false },
        partial: false
    };
}

describe('Event deduplication (integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSharedEventDedupe();
        vi.mocked(getLockRedis).mockResolvedValue(createFakeRedis() as never);
        vi.mocked(createMessageDeleteEmbed).mockResolvedValue({ title: 'deleted' } as never);
        vi.mocked(logEvent).mockResolvedValue(undefined as never);
    });

    it('should skip duplicate delivery of the same Discord event', async () => {
        const message = createMessage('msg-1') as never;

        await messageDeleteHandler.execute(message, undefined);
        await messageDeleteHandler.execute(message, undefined);

        expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(1);
    });

    it('should process distinct events normally', async () => {
        await messageDeleteHandler.execute(createMessage('msg-1') as never, undefined);
        await messageDeleteHandler.execute(createMessage('msg-2') as never, undefined);

        expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(2);
    });

    it('should fail open and process events when Redis is unavailable', async () => {
        vi.mocked(getLockRedis).mockResolvedValue(null);
        const message = createMessage('msg-9') as never;

        await messageDeleteHandler.execute(message, undefined);
        await messageDeleteHandler.execute(message, undefined);

        expect(vi.mocked(logEvent)).toHaveBeenCalledTimes(2);
    });
});
