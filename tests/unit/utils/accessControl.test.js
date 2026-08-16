import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as accessControl from '../../../src/utils/accessControl.js';

describe('accessControl', () => {
    const originalEnv = process.env.OWNER_IDS;

    beforeEach(() => {
        vi.resetModules();
        accessControl.clearOwnerIdsCache();
        process.env.OWNER_IDS = originalEnv;
    });

    afterEach(() => {
        process.env.OWNER_IDS = originalEnv;
        accessControl.clearOwnerIdsCache();
    });

    describe('getOwnerIds', () => {
        it('returns empty array when OWNER_IDS not set', () => {
            delete process.env.OWNER_IDS;
            expect(accessControl.getOwnerIds()).toEqual([]);
        });

        it('parses single owner ID', () => {
            process.env.OWNER_IDS = '123456789';
            expect(accessControl.getOwnerIds()).toEqual(['123456789']);
        });

        it('parses multiple owner IDs', () => {
            process.env.OWNER_IDS = '123456789,987654321,555555555';
            expect(accessControl.getOwnerIds()).toEqual(['123456789', '987654321', '555555555']);
        });

        it('trims whitespace from IDs', () => {
            process.env.OWNER_IDS = ' 123456789 , 987654321 ';
            expect(accessControl.getOwnerIds()).toEqual(['123456789', '987654321']);
        });

        it('filters empty entries', () => {
            process.env.OWNER_IDS = '123456789,,987654321,';
            expect(accessControl.getOwnerIds()).toEqual(['123456789', '987654321']);
        });

        it('caches result', () => {
            process.env.OWNER_IDS = '123456789';
            const first = accessControl.getOwnerIds();
            process.env.OWNER_IDS = '999999999';
            const second = accessControl.getOwnerIds();
            expect(second).toEqual(['123456789']);
        });
    });

    describe('clearOwnerIdsCache', () => {
        it('clears cache allowing re-read', () => {
            process.env.OWNER_IDS = '123456789';
            accessControl.getOwnerIds();
            process.env.OWNER_IDS = '987654321';
            accessControl.clearOwnerIdsCache();
            expect(accessControl.getOwnerIds()).toEqual(['987654321']);
        });
    });

    describe('isOwner', () => {
        it('returns false when no owners configured', () => {
            delete process.env.OWNER_IDS;
            expect(accessControl.isOwner('123456789')).toBe(false);
        });

        it('returns true for configured owner', () => {
            process.env.OWNER_IDS = '123456789,987654321';
            expect(accessControl.isOwner('123456789')).toBe(true);
            expect(accessControl.isOwner('987654321')).toBe(true);
        });

        it('returns false for non-owner', () => {
            process.env.OWNER_IDS = '123456789';
            expect(accessControl.isOwner('999999999')).toBe(false);
        });
    });

    describe('isOwnerInteraction', () => {
        it('checks interaction user ID', () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '123456789' } };
            expect(accessControl.isOwnerInteraction(interaction)).toBe(true);
        });

        it('returns false for non-owner interaction', () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '999999999' } };
            expect(accessControl.isOwnerInteraction(interaction)).toBe(false);
        });
    });

    describe('createAccessDeniedEmbed', () => {
        it('creates embed with default message', () => {
            const embed = accessControl.createAccessDeniedEmbed();
            expect(embed.data.color).toBe(0xFF0000);
            expect(embed.data.title).toBe('[ERROR] Access Denied');
            expect(embed.data.description).toBe('Only bot owners can use this command.');
            expect(embed.data.timestamp).toBeDefined();
        });

        it('creates embed with custom message', () => {
            const embed = accessControl.createAccessDeniedEmbed('Custom denial message');
            expect(embed.data.description).toBe('Custom denial message');
        });
    });

    describe('requireOwner', () => {
        it('returns null for owner', async () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '123456789' } };
            const result = await accessControl.requireOwner(interaction);
            expect(result).toBeNull();
        });

        it('returns denial reply for non-owner', async () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '999999999' } };
            const result = await accessControl.requireOwner(interaction);
            expect(result).toBeDefined();
            expect(result.embeds[0].data.title).toBe('[ERROR] Access Denied');
            expect(result.ephemeral).toBe(true);
        });

        it('respects ephemeral option', async () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '999999999' } };
            const result = await accessControl.requireOwner(interaction, { ephemeral: false });
            expect(result.ephemeral).toBe(false);
        });

        it('uses custom message', async () => {
            process.env.OWNER_IDS = '123456789';
            const interaction = { user: { id: '999999999' } };
            const result = await accessControl.requireOwner(interaction, { customMessage: 'Custom deny' });
            expect(result.embeds[0].data.description).toBe('Custom deny');
        });
    });

    describe('withOwnerCheck', () => {
        it('calls executeFn for owner', async () => {
            process.env.OWNER_IDS = '123456789';
            const executeFn = vi.fn().mockResolvedValue('success');
            const wrapped = accessControl.withOwnerCheck(executeFn);
            const interaction = { user: { id: '123456789' }, replied: false, deferred: false };
            const result = await wrapped(interaction);
            expect(executeFn).toHaveBeenCalledWith(interaction);
            expect(result).toBe('success');
        });

        it('returns denial for non-owner without calling executeFn', async () => {
            process.env.OWNER_IDS = '123456789';
            const executeFn = vi.fn();
            const wrapped = accessControl.withOwnerCheck(executeFn);
            const interaction = { 
                user: { id: '999999999' }, 
                replied: false, 
                deferred: false,
                reply: vi.fn().mockResolvedValue(undefined)
            };
            await wrapped(interaction);
            expect(executeFn).not.toHaveBeenCalled();
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('uses editReply when interaction already replied', async () => {
            process.env.OWNER_IDS = '123456789';
            const executeFn = vi.fn();
            const wrapped = accessControl.withOwnerCheck(executeFn);
            const interaction = { 
                user: { id: '999999999' }, 
                replied: true, 
                deferred: false,
                editReply: vi.fn().mockResolvedValue(undefined)
            };
            await wrapped(interaction);
            expect(interaction.editReply).toHaveBeenCalled();
        });

        it('uses editReply when interaction deferred', async () => {
            process.env.OWNER_IDS = '123456789';
            const executeFn = vi.fn();
            const wrapped = accessControl.withOwnerCheck(executeFn);
            const interaction = { 
                user: { id: '999999999' }, 
                replied: false, 
                deferred: true,
                editReply: vi.fn().mockResolvedValue(undefined)
            };
            await wrapped(interaction);
            expect(interaction.editReply).toHaveBeenCalled();
        });
    });

    describe('hasPermission', () => {
        it('returns true when member has permission', () => {
            const member = { permissions: { has: vi.fn().mockReturnValue(true) } };
            expect(accessControl.hasPermission(member, 'BanMembers')).toBe(true);
        });

        it('returns false when member lacks permission', () => {
            const member = { permissions: { has: vi.fn().mockReturnValue(false) } };
            expect(accessControl.hasPermission(member, 'BanMembers')).toBe(false);
        });
    });

    describe('hasAnyPermission', () => {
        it('returns true when member has at least one permission', () => {
            const member = { permissions: { has: vi.fn().mockImplementation(p => p === 'KickMembers') } };
            expect(accessControl.hasAnyPermission(member, ['BanMembers', 'KickMembers'])).toBe(true);
        });

        it('returns false when member has none of the permissions', () => {
            const member = { permissions: { has: vi.fn().mockReturnValue(false) } };
            expect(accessControl.hasAnyPermission(member, ['BanMembers', 'KickMembers'])).toBe(false);
        });
    });

    describe('hasAllPermissions', () => {
        it('returns true when member has all permissions', () => {
            const member = { permissions: { has: vi.fn().mockReturnValue(true) } };
            expect(accessControl.hasAllPermissions(member, ['BanMembers', 'KickMembers'])).toBe(true);
        });

        it('returns false when member lacks any permission', () => {
            const member = { permissions: { has: vi.fn().mockImplementation(p => p === 'BanMembers') } };
            expect(accessControl.hasAllPermissions(member, ['BanMembers', 'KickMembers'])).toBe(false);
        });
    });

    describe('createPermissionDeniedEmbed', () => {
        it('creates embed with default permission name', () => {
            const embed = accessControl.createPermissionDeniedEmbed();
            expect(embed.data.color).toBe(0xFF0000);
            expect(embed.data.title).toBe('[ERROR] Permission Denied');
            expect(embed.data.description).toContain('the required permission');
        });

        it('creates embed with custom permission name', () => {
            const embed = accessControl.createPermissionDeniedEmbed('BanMembers');
            expect(embed.data.description).toContain('BanMembers');
        });
    });

    describe('requirePermission', () => {
        it('returns null when member has permission in guild', async () => {
            const interaction = { 
                guild: { id: '123' }, 
                member: { permissions: { has: vi.fn().mockReturnValue(true) } } 
            };
            const result = await accessControl.requirePermission(interaction, 'BanMembers');
            expect(result).toBeNull();
        });

        it('returns denial when member lacks permission', async () => {
            const interaction = { 
                guild: { id: '123' }, 
                member: { permissions: { has: vi.fn().mockReturnValue(false) } } 
            };
            const result = await accessControl.requirePermission(interaction, 'BanMembers');
            expect(result).toBeDefined();
            expect(result.embeds[0].data.title).toBe('[ERROR] Permission Denied');
        });

        it('returns denial when no guild context', async () => {
            const interaction = { guild: null, member: null };
            const result = await accessControl.requirePermission(interaction, 'BanMembers');
            expect(result).toBeDefined();
            expect(result.embeds[0].data.description).toContain('guild context');
        });
    });
});