// Moderation utilities
// Shared authorization helpers for moderation commands

/**
 * Check whether a moderator may take action against a target member.
 * Denies self-moderation, targeting the guild owner, and targeting a
 * member whose highest role is at or above the moderator's.
 *
 * @param {{ownerId: string|null}} guild - the guild (ownerId used for owner check)
 * @param {{id: string, roles?: {highest?: {position: number}}}|null} moderator
 * @param {{id: string, roles?: {highest?: {position: number}}}|null} target
 * @returns {{ok: boolean, reason?: string}}
 */
export function canModerate(guild, moderator, target) {
    if (!moderator || !moderator.id) {
        // Cannot determine hierarchy; permission gate already applied by Discord.
        return { ok: true };
    }

    if (!target) {
        // Target is not in the server (e.g. banning an external user id).
        return { ok: true };
    }

    if (target.id === moderator.id) {
        return { ok: false, reason: 'You cannot moderate yourself.' };
    }

    if (guild && guild.ownerId && target.id === guild.ownerId) {
        return { ok: false, reason: 'You cannot moderate the server owner.' };
    }

    const moderatorPosition = moderator.roles?.highest?.position ?? 0;
    const targetPosition = target.roles?.highest?.position ?? 0;

    if (moderatorPosition > 0 && targetPosition > 0 && targetPosition >= moderatorPosition) {
        return { ok: false, reason: 'That member has a role equal to or higher than yours.' };
    }

    return { ok: true };
}
