import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGuildData, setGuildData, updateGuildData } from '../../src/utils/db.js';
import { createAdapter, getUserData, setUserData } from '../../src/db/adapter.js';
import { getDb } from '../../src/db/knex.js';

describe('Data isolation fitness functions', () => {
    it('guild data is scoped by guild_id with no cross-guild leakage', async () => {
        const store = 'config';
        const guildA = '111111111111111111';
        const guildB = '222222222222222222';

        await setGuildData(store, guildA, { prefix: 'a!', custom: { secret: 'guild-a-only' } });
        await setGuildData(store, guildB, { prefix: 'b!', custom: { secret: 'guild-b-only' } });

        const dataA = await getGuildData(store, guildA);
        const dataB = await getGuildData(store, guildB);

        expect(dataA['prefix']).toBe('a!');
        expect(dataB['prefix']).toBe('b!');
        expect(dataA['prefix']).not.toBe(dataB['prefix']);
    });

    it('user data is scoped by user_id within a guild', async () => {
        createAdapter(getDb());
        const store = 'user';
        const guildId = '333333333333333333';

        await setUserData(store, guildId, 'arch-user-a', { language: 'en-US' });
        await setUserData(store, guildId, 'arch-user-b', { language: 'de' });

        const userA = await getUserData(store, guildId, 'arch-user-a');
        const userB = await getUserData(store, guildId, 'arch-user-b');

        expect(userA?.['language']).toBe('en-US');
        expect(userB?.['language']).toBe('de');
        expect(await getUserData(store, guildId, 'arch-user-unknown')).toBeUndefined();
    });

    it('read-modify-write stays scoped and repeatable through atomic upserts', async () => {
        const store = 'config';
        const guildId = '444444444444444444';

        await setGuildData(store, guildId, { caseNumber: 0 });
        const next = await updateGuildData(store, guildId, (current) => ({
            ...current,
            caseNumber: ((current['caseNumber'] as number) ?? 0) + 1
        }));

        expect(next['caseNumber']).toBe(1);
        expect((await getGuildData(store, guildId))['caseNumber']).toBe(1);

        createAdapter(getDb());
        await setUserData('user', guildId, 'arch-user-c', { mutes: 1 });
        await setUserData('user', guildId, 'arch-user-c', { mutes: 2 });
        expect((await getUserData('user', guildId, 'arch-user-c'))?.['mutes']).toBe(2);
    });

    it('adapter persists read-modify-write with conflict-safe scoped upserts', () => {
        const source = readFileSync(join(process.cwd(), 'src', 'db', 'adapter.ts'), 'utf8');
        expect(source).toContain(".onConflict(['store', 'guild_id'])");
        expect(source).toContain(".onConflict(['store', 'guild_id', 'user_id'])");
        expect(source).toContain('updateGuildData');
    });
});
