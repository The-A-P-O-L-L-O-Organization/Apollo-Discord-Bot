// Moderation utilities
// Shared authorization helpers for moderation commands

import type { APIInteractionGuildMember } from 'discord.js';

interface GuildLike {
    ownerId: string | null;
}

interface MemberLike {
    id: string;
    roles?: {
        highest?: {
            position: number;
        };
    } | null;
}

interface ModerationResult {
    ok: boolean;
    reason?: string;
}

/**
 * Check whether a moderator may take action against a target member.
 * Denies self-moderation, targeting the guild owner, and targeting a
 * member whose highest role is at or above the moderator's.
 *
 * @param guild - the guild (ownerId used for owner check)
 * @param moderator - the moderator member
 * @param target - the target member
 * @returns {ok: boolean, reason?: string}
 */
export function canModerate(
    guild: GuildLike,
    moderator: MemberLike | APIInteractionGuildMember | null,
    target: MemberLike | null
): ModerationResult {
    const moderatorId = moderator && 'id' in moderator ? moderator.id : moderator?.user?.id;
    if (!moderatorId) {
        return { ok: false, reason: 'Cannot verify moderator identity.' };
    }

    if (!target) {
        // Target is not in the server (e.g. banning an external user id).
        return { ok: true };
    }

    if (target.id === moderatorId) {
        return { ok: false, reason: 'You cannot moderate yourself.' };
    }

    if (guild?.ownerId && target.id === guild.ownerId) {
        return { ok: false, reason: 'You cannot moderate the server owner.' };
    }

    const modRoles = moderator && 'roles' in moderator ? moderator.roles : undefined;
    const moderatorPosition = (!Array.isArray(modRoles) ? modRoles?.highest?.position : undefined) ?? 0;
    const targetPosition = target.roles?.highest?.position ?? 0;

    if (moderatorPosition > 0 && targetPosition > 0 && targetPosition >= moderatorPosition) {
        return { ok: false, reason: 'That member has a role equal to or higher than yours.' };
    }

    return { ok: true };
}