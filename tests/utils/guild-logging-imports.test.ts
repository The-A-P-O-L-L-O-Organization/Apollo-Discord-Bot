import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('admin event imports', () => {
    it('imports guild-log helpers from guildLogging not logger', () => {
        const files: string[] = ['guildBanAdd', 'guildBanRemove', 'guildMemberUpdate', 'messageDelete', 'messageDeleteBulk', 'messageUpdate', 'voiceStateUpdate'];
        for (const f of files) {
            const src: string = readFileSync(`src/plugins/admin/events/${f}.ts`, 'utf8');
            expect(src).not.toContain('utils/logger.js');
            expect(src).toContain('utils/guildLogging.js');
        }
    });
});
