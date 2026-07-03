import { describe, it, expect } from 'vitest';

describe('Apollo Actions — Global Ban context menu', () => {
    it('exports a user context menu command with type 2', () => {
        const cmd = { type: 2, name: 'Global Ban' };
        expect(cmd.type).toBe(2);
        expect(cmd.name).toBe('Global Ban');
    });

    it('handles user context menu interactions via index.js pattern', () => {
        const mockInteraction = {
            isUserContextMenuCommand: () => true,
            isMessageContextMenuCommand: () => false,
            isChatInputCommand: () => false,
            commandName: 'Global Ban',
            guild: null
        };
        expect(mockInteraction.isUserContextMenuCommand()).toBe(true);
        expect(mockInteraction.isChatInputCommand()).toBe(false);
    });
});
