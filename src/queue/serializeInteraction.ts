import { encode } from 'msgpackr';
import type { SerializedInteraction, SerializedCommandOption, SerializedCommandData, SerializedUser, SerializedMember } from '../types/shared.js';

export function serializeInteraction(interaction: {
    id: string;
    token: string;
    commandName: string;
    commandId: string;
    createdTimestamp: number;
    guildId: string | null;
    channelId: string;
    user: { id: string; tag?: string; username?: string; discriminator?: string; avatar?: string };
    member?: { permissions?: { toArray?: () => string[] }; roles?: { cache?: Map<string, { id: string }> } };
    options: { data?: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[] };
}): SerializedInteraction {
    const serializedUser: SerializedUser = {
        id: interaction.user.id,
        username: interaction.user.username ?? 'Unknown',
        discriminator: interaction.user.discriminator ?? '0',
        avatar: interaction.user.avatar ?? null,
        bot: false,
        system: false
    };

    const serializedMember: SerializedMember | null = interaction.member ? {
        user: serializedUser,
        roles: interaction.member.roles?.cache ? Array.from(interaction.member.roles.cache.values()).map(r => r.id) : [],
        joinedAt: null,
        premiumSince: null,
        permissions: interaction.member.permissions?.toArray?.().join(',') ?? '0',
        pending: false
    } : null;

    const serializedData: SerializedCommandData | null = interaction.options?.data ? {
        id: interaction.commandId,
        name: interaction.commandName,
        type: 1, // CHAT_INPUT
        options: serializeOptionsData(interaction.options)
    } : null;

    return {
        id: interaction.id,
        type: 2, // APPLICATION_COMMAND
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: serializedUser,
        member: serializedMember,
        data: serializedData,
        token: interaction.token,
        version: 1,
        appPermissions: '0',
        locale: 'en-US',
        guildLocale: 'en-US',
        entitlements: []
    };
}

function serializeOptionsData(options: { data?: { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[] }): SerializedCommandOption[] {
    if (!options?.data) { return []; }
    return options.data.map(o => {
        const serialized: SerializedCommandOption = {
            name: o.name,
            type: o.type,
            value: o.value,
            focused: o.focused ?? false
        };
        if (o.options) {
            serialized.options = serializeOptionsData({ data: o.options as { name: string; type: number; value: unknown; focused?: boolean; options?: unknown[] }[] });
        }
        return serialized;
    });
}

/**
 * Serializes interaction data using msgpackr for queue transport
 * @param data - Interaction data object
 * @returns msgpackr encoded buffer
 */
export function serializeForQueue(data: unknown): Buffer {
    return encode(data);
}