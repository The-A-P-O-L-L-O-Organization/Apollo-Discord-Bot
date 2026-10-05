import type { REST } from 'discord.js';

export class DiscordAPI {
    rest: REST;
    applicationId: string;

    constructor(rest: REST, applicationId: string) {
        this.rest = rest;
        this.applicationId = applicationId;
    }
}
