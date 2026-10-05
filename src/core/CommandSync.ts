import { Routes } from 'discord.js';
import { buildLocalizedPayload } from '../i18n/commandPayload.js';
import type { CommandInput } from '../i18n/commandPayload.js';
import type { REST } from 'discord.js';
import { logger } from '../utils/logger.js';

interface CommandSyncClient {
    rest: REST;
    config: { discord: { clientId: string }; guildId?: string };
    commands?: Map<string, unknown>;
}

export class CommandSync {
    private client: CommandSyncClient;

    constructor(client: CommandSyncClient) {
        this.client = client;
    }

    async syncCommands(pluginId: string, commands: unknown[]): Promise<void> {
        await this.putCommands(commands, `[ERROR] Failed to sync commands for plugin ${pluginId}`, this.client.config.guildId);
    }

    async syncAllCommands(): Promise<void> {
        const commands = [...(this.client.commands?.values() ?? [])];
        await this.putCommands(commands, '[ERROR] Failed to sync commands with Discord', undefined);
    }

    private async putCommands(commands: unknown[], errorMessage: string, guildId?: string): Promise<void> {
        try {
            const rest = this.client.rest;
            const clientConfig = this.client.config;
            const CLIENT_ID = clientConfig.discord.clientId;
            if (!CLIENT_ID) { return; }

            const body = commands.map(cmd => buildLocalizedPayload(cmd as CommandInput));

            if (guildId) {
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, guildId),
                    { body }
                );
            } else {
                await rest.put(
                    Routes.applicationCommands(CLIENT_ID),
                    { body }
                );
            }
        } catch (error) {
            logger.error({ err: error, msg: errorMessage });
        }
    }
}
