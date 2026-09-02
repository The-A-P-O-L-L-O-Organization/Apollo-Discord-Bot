import { encode } from 'msgpackr';

export function serializeInteraction(interaction) {
    return {
        id: interaction.id,
        token: interaction.token,
        commandName: interaction.commandName,
        commandId: interaction.commandId,
        createdTimestamp: interaction.createdTimestamp,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        memberPermissions: interaction.member?.permissions?.toArray?.() || [],
        memberRoles: interaction.member?.roles?.cache?.map(r => r.id) || [],
        options: serializeOptionsData(interaction.options)
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

/**
 * Serializes interaction data using msgpackr for queue transport
 * @param {Object} data - Interaction data object
 * @returns {Buffer} msgpackr encoded buffer
 */
export function serializeForQueue(data) {
    return encode(data);
}
