import { describe, it, expect } from 'vitest';
import { canModerate } from '../../../src/utils/moderation.js';

function role(position) {
    return { position };
}

function member(id, opts = {}) {
    return {
        id,
        roles: {
            highest: opts.highest ? role(opts.highest) : undefined
        }
    };
}

describe('canModerate', () => {
    it('should allow moderating a target with lower role', () => {
        const moderator = member('mod', { highest: 5 });
        const target = member('target', { highest: 3 });
        expect(canModerate({ ownerId: 'owner' }, moderator, target)).toEqual({ ok: true });
    });

    it('should block moderating a target with a higher role', () => {
        const moderator = member('mod', { highest: 3 });
        const target = member('target', { highest: 5 });
        expect(canModerate({ ownerId: 'owner' }, moderator, target).ok).toBe(false);
    });

    it('should block moderating a target with an equal role', () => {
        const moderator = member('mod', { highest: 4 });
        const target = member('target', { highest: 4 });
        expect(canModerate({ ownerId: 'owner' }, moderator, target).ok).toBe(false);
    });

    it('should block moderating the guild owner', () => {
        const moderator = member('mod', { highest: 10 });
        const target = member('owner', { highest: 11 });
        expect(canModerate({ ownerId: 'owner' }, moderator, target).ok).toBe(false);
    });

    it('should block self-moderation', () => {
        const moderator = member('mod', { highest: 5 });
        expect(canModerate({ ownerId: 'owner' }, moderator, { id: 'mod' }).ok).toBe(false);
    });

    it('should allow when target is null (not in server)', () => {
        expect(canModerate({ ownerId: 'owner' }, member('mod', { highest: 5 }), null)).toEqual({ ok: true });
    });

    it('should allow when moderator roles are unknown', () => {
        const moderator = { id: 'mod' };
        const target = member('target', { highest: 3 });
        expect(canModerate({ ownerId: 'owner' }, moderator, target)).toEqual({ ok: true });
    });

    it('should allow when target roles are unknown', () => {
        const moderator = member('mod', { highest: 5 });
        const target = { id: 'target' };
        expect(canModerate({ ownerId: 'owner' }, moderator, target)).toEqual({ ok: true });
    });
});
