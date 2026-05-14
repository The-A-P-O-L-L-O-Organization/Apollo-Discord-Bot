export function serializeInteraction(interaction) {
    const resolved = interaction.options?.resolved;
    return {
        id: interaction.id,
        applicationId: interaction.applicationId,
        interactionToken: interaction.token,
        commandName: interaction.commandName,
        commandId: interaction.commandId,
        createdTimestamp: interaction.createdTimestamp,
        guildId: interaction.guildId,
        guildName: interaction.guild?.name,
        channelId: interaction.channelId,
        channelName: interaction.channel?.name,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        username: interaction.user.username,
        userDiscriminator: interaction.user.discriminator,
        userAvatar: interaction.user.avatar,
        memberPermissions: interaction.member?.permissions?.toArray?.() || [],
        memberRoles: interaction.member?.roles?.cache?.map(r => r.id) || [],
        options: serializeOptionsData(interaction.options),
        resolved: resolved ? serializeResolved(resolved) : null
    };
}

function serializeOptionsData(options) {
    if (!options) {return [];}
    const data = options.data || [];
    return data.map(o => ({
        name: o.name,
        type: o.type,
        value: o.value,
        focused: o.focused,
        options: o.options ? serializeOptionsData({ data: o.options }) : undefined
    }));
}

function serializeResolved(resolved) {
    const result = {};
    if (resolved.users) {
        result.users = {};
        for (const [id, user] of resolved.users) {
            result.users[id] = { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar };
        }
    }
    if (resolved.members) {
        result.members = {};
        for (const [id, member] of resolved.members) {
            result.members[id] = { id: member.id, roles: member.roles?.map?.(r => r.id) || [], joinedTimestamp: member.joinedTimestamp };
        }
    }
    if (resolved.channels) {
        result.channels = {};
        for (const [id, channel] of resolved.channels) {
            result.channels[id] = { id: channel.id, name: channel.name, type: channel.type };
        }
    }
    if (resolved.roles) {
        result.roles = {};
        for (const [id, role] of resolved.roles) {
            result.roles[id] = { id: role.id, name: role.name, color: role.color };
        }
    }
    return result;
}
