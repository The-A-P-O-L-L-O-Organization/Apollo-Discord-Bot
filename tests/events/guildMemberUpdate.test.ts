// Guild Member Update Event Tests
// Tests for the guildMemberUpdate event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GuildMember, Guild } from 'discord.js';
import guildMemberUpdateEvent from '../../src/plugins/admin/events/guildMemberUpdate.js';
import {
    createMockMember,
    createMockUser,
    createMockGuild,
    createMockClient
} from '../mocks/discord.js';
import type { MockMemberOptions } from '../mocks/discord.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createRoleChangeEmbed: vi.fn()
}));

import * as mockedLogger from '../../src/utils/logger.js';

const { logEvent, createRoleChangeEmbed } = mockedLogger as unknown as {
    logEvent: ReturnType<typeof vi.fn>;
    createRoleChangeEmbed: ReturnType<typeof vi.fn>;
};

describe('GuildMemberUpdate Event', () => {
    let oldMember: GuildMember;
    let newMember: GuildMember;
    let mockGuild: Guild;
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        const oldRolesCache = new Map();
        oldRolesCache.set('role1', { id: 'role1', name: 'Member' });
        
        const newRolesCache = new Map();
        newRolesCache.set('role1', { id: 'role1', name: 'Member' });
        newRolesCache.set('role2', { id: 'role2', name: 'Moderator' });
        
        oldMember = createMockMember({
            id: '123456789',
            user: createMockUser({
                id: '123456789',
                tag: 'TestUser#0001',
                bot: false
            }) as unknown as MockMemberOptions['user'],
            guild: mockGuild as unknown as MockMemberOptions['guild'],
            roles: oldRolesCache as unknown as MockMemberOptions['roles']
        });
        (oldMember.roles as unknown as { cache: unknown }).cache = oldRolesCache;

        newMember = createMockMember({
            id: '123456789',
            user: createMockUser({
                id: '123456789',
                tag: 'TestUser#0001',
                bot: false
            }) as unknown as MockMemberOptions['user'],
            guild: mockGuild as unknown as MockMemberOptions['guild'],
            roles: newRolesCache as unknown as MockMemberOptions['roles']
        });
        (newMember.roles as unknown as { cache: unknown }).cache = newRolesCache;
        
        mockClient = createMockClient();
        
        // Default: return a mock embed indicating role changes
        createRoleChangeEmbed.mockReturnValue({ toJSON: () => ({ title: 'Role Update' }) });
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(guildMemberUpdateEvent.name).toBe('guildMemberUpdate');
        });

        it('should not be a once event', () => {
            expect(guildMemberUpdateEvent.once).toBe(false);
        });
    });

    describe('Success Cases', () => {
        it('should log role changes for non-bot users', async() => {
            await guildMemberUpdateEvent.execute(oldMember, newMember, mockClient);
            
            expect(createRoleChangeEmbed).toHaveBeenCalledWith(oldMember, newMember);
            expect(logEvent).toHaveBeenCalledWith(
                mockGuild, 
                'roleChanges', 
                expect.anything()
            );
        });

        it('should pass both old and new member to createRoleChangeEmbed', async() => {
            await guildMemberUpdateEvent.execute(oldMember, newMember, mockClient);
            
            expect(createRoleChangeEmbed).toHaveBeenCalledWith(oldMember, newMember);
        });
    });

    describe('No Role Changes', () => {
        it('should not log when there are no role changes', async() => {
            createRoleChangeEmbed.mockReturnValue(null);
            
            await guildMemberUpdateEvent.execute(oldMember, newMember, mockClient);
            
            expect(createRoleChangeEmbed).toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Bot User Handling', () => {
        it('should not log updates for bot users', async() => {
            newMember.user.bot = true;
            
            await guildMemberUpdateEvent.execute(oldMember, newMember, mockClient);
            
            expect(logEvent).not.toHaveBeenCalled();
            expect(createRoleChangeEmbed).not.toHaveBeenCalled();
        });
    });

    describe('Role Added', () => {
        it('should detect when a role is added', async() => {
            await guildMemberUpdateEvent.execute(oldMember, newMember, mockClient);
            
            expect(createRoleChangeEmbed).toHaveBeenCalledWith(oldMember, newMember);
            expect(logEvent).toHaveBeenCalled();
        });
    });

    describe('Role Removed', () => {
        it('should detect when a role is removed', async() => {
            // Swap old and new to simulate role removal
            await guildMemberUpdateEvent.execute(newMember, oldMember, mockClient);
            
            expect(createRoleChangeEmbed).toHaveBeenCalledWith(newMember, oldMember);
        });
    });

    describe('Edge Cases', () => {
        it('should handle member with no roles', async() => {
            const emptyRolesCache = new Map();
            (oldMember.roles as unknown as { cache: unknown }).cache = emptyRolesCache;
            (newMember.roles as unknown as { cache: unknown }).cache = emptyRolesCache;
            createRoleChangeEmbed.mockReturnValue(null);
            
            await expect(
                guildMemberUpdateEvent.execute(oldMember, newMember, mockClient)
            ).resolves.not.toThrow();
        });

        it('should handle logging errors gracefully', async() => {
            logEvent.mockRejectedValue(new Error('Logging failed'));
            
            await expect(
                guildMemberUpdateEvent.execute(oldMember, newMember, mockClient)
            ).rejects.toThrow('Logging failed');
        });
    });
});
