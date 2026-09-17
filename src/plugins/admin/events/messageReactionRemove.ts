import { getGuildData } from '../../../utils/db.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'messageReactionRemove',
    once: false,

    async execute(reaction: any, user: any, _client: any) {
        if (user.bot) { return; }

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Failed to fetch reaction:' });
                return;
            }
        }

        if (!reaction.message.guild) { return; }

        const guild = reaction.message.guild;
        const guildId = guild.id;
        const messageId = reaction.message.id;

        const emojiIdentifier = reaction.emoji.id
            ? `${reaction.emoji.name}:${reaction.emoji.id}`
            : reaction.emoji.name;

        const reactionRoles = await getGuildData('reactionroles', guildId);
        const roles = (reactionRoles['roles'] ?? []) as { messageId: string; emoji: string; roleId: string }[];
        if (roles.length === 0) { return; }

        const reactionRole = roles.find(
            (rr) => rr.messageId === messageId &&
                  (rr.emoji === emojiIdentifier || rr.emoji === reaction.emoji.name || rr.emoji === reaction.emoji.id)
        );

        if (!reactionRole) { return; }

        let member;
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
            logger.error({ err: error, msg: `[ERROR] Failed to fetch member ${user.id}:` });
            return;
        }

        if (!member.roles.cache.has(reactionRole.roleId)) {
            return;
        }

        try {
            await member.roles.remove(reactionRole.roleId, 'Reaction role removed');
            logger.info({ msg: `[INFO] Removed role ${reactionRole.roleId} from ${user.tag} via reaction role` });
        } catch (error) {
            logger.error({ err: error, msg: `[ERROR] Failed to remove role ${reactionRole.roleId} from ${user.tag}:` });
        }
    }
};