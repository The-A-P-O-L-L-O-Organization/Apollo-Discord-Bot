import { getGuildData } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { logger } from '../../../utils/logger.js';

export default {
    name: 'messageReactionAdd',
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
        const guildId = guild.id as string;
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

        if (member.roles.cache.has(reactionRole.roleId)) {
            return;
        }

        try {
            await member.roles.add(reactionRole.roleId, 'Reaction role');
            logger.info({ msg: `[INFO] Added role ${reactionRole.roleId} to ${user.tag} via reaction role` });

            if (config.reactionRoles.dmOnRole) {
                try {
                    const role = await guild.roles.fetch(reactionRole.roleId);
                    await user.send({
                        content: `You have been given the **${role.name}** role in **${guild.name}**!`
                    });
                } catch {
                }
            }
        } catch (error) {
            logger.error({ err: error, msg: `[ERROR] Failed to add role ${reactionRole.roleId} to ${user.tag}:` });
        }
    }
};