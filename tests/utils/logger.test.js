// Logger Utility Tests
// Tests for the event logging functions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbedBuilder } from 'discord.js';
import {
    createMessageDeleteEmbed,
    createMessageEditEmbed,
    createMemberJoinEmbed,
    createMemberLeaveEmbed,
    createRoleChangeEmbed,
    createVoiceChangeEmbed
} from '../../src/utils/logger.js';
import { 
    createMockMessage, 
    createMockUser, 
    createMockMember,
    createMockGuild,
    createMockVoiceState,
    createMockChannel
} from '../mocks/discord.js';

describe('Logger Utility', () => {
    describe('createMessageDeleteEmbed', () => {
        it('should create embed with message content', () => {
            const message = createMockMessage({
                content: 'Test deleted message',
                author: createMockUser({ tag: 'TestUser#0001', id: '123' })
            });

            const embed = createMessageDeleteEmbed(message);
            
            expect(embed).toBeInstanceOf(EmbedBuilder);
            const data = embed.toJSON();
            expect(data.title).toBe('🗑️ Message Deleted');
            expect(data.description).toBe('Test deleted message');
        });

        it('should handle empty content', () => {
            const message = createMockMessage({
                content: '',
                author: createMockUser()
            });

            const embed = createMessageDeleteEmbed(message);
            const data = embed.toJSON();
            
            expect(data.description).toBe('*No text content*');
        });

        it('should include author information', () => {
            const message = createMockMessage({
                content: 'Test',
                author: createMockUser({ tag: 'Author#1234', id: '111222333' })
            });

            const embed = createMessageDeleteEmbed(message);
            const data = embed.toJSON();
            
            const authorField = data.fields.find(f => f.name === 'Author');
            expect(authorField.value).toContain('Author#1234');
            expect(authorField.value).toContain('111222333');
        });

        it('should include channel reference', () => {
            const channel = createMockChannel({ id: '999888777' });
            const message = createMockMessage({
                content: 'Test',
                channel
            });

            const embed = createMessageDeleteEmbed(message);
            const data = embed.toJSON();
            
            const channelField = data.fields.find(f => f.name === 'Channel');
            expect(channelField.value).toBe('<#999888777>');
        });

        it('should include attachment information when present', () => {
            const attachments = new Map([
                ['1', { url: 'https://example.com/image1.png' }],
                ['2', { url: 'https://example.com/image2.png' }]
            ]);
            const message = createMockMessage({
                content: 'Test',
                attachments
            });

            const embed = createMessageDeleteEmbed(message);
            const data = embed.toJSON();
            
            const attachField = data.fields.find(f => f.name.includes('Attachments'));
            expect(attachField).toBeTruthy();
            expect(attachField.name).toContain('2');
        });

        it('should handle unknown author', () => {
            const message = createMockMessage({
                content: 'Test',
                author: null
            });

            const embed = createMessageDeleteEmbed(message);
            const data = embed.toJSON();
            
            const authorField = data.fields.find(f => f.name === 'Author');
            expect(authorField.value).toContain('Unknown');
        });
    });

    describe('createMessageEditEmbed', () => {
        it('should show old and new content', () => {
            const oldMessage = createMockMessage({ content: 'Old content' });
            const newMessage = createMockMessage({ 
                content: 'New content',
                url: 'https://discord.com/channels/1/2/3'
            });

            const embed = createMessageEditEmbed(oldMessage, newMessage);
            const data = embed.toJSON();
            
            expect(data.title).toBe('✏️ Message Edited');
            
            const beforeField = data.fields.find(f => f.name === 'Before');
            const afterField = data.fields.find(f => f.name === 'After');
            
            expect(beforeField.value).toBe('Old content');
            expect(afterField.value).toBe('New content');
        });

        it('should handle empty content', () => {
            const oldMessage = createMockMessage({ content: '' });
            const newMessage = createMockMessage({ content: 'Now has content' });

            const embed = createMessageEditEmbed(oldMessage, newMessage);
            const data = embed.toJSON();
            
            const beforeField = data.fields.find(f => f.name === 'Before');
            expect(beforeField.value).toBe('*Empty*');
        });

        it('should include jump link', () => {
            const oldMessage = createMockMessage({ content: 'Old' });
            const newMessage = createMockMessage({ 
                content: 'New',
                url: 'https://discord.com/test/link'
            });

            const embed = createMessageEditEmbed(oldMessage, newMessage);
            const data = embed.toJSON();
            
            const jumpField = data.fields.find(f => f.name === 'Jump to Message');
            expect(jumpField.value).toContain('https://discord.com/test/link');
        });

        it('should truncate long content', () => {
            const longContent = 'x'.repeat(2000);
            const oldMessage = createMockMessage({ content: longContent });
            const newMessage = createMockMessage({ content: 'Short' });

            const embed = createMessageEditEmbed(oldMessage, newMessage);
            const data = embed.toJSON();
            
            const beforeField = data.fields.find(f => f.name === 'Before');
            expect(beforeField.value.length).toBeLessThanOrEqual(1024);
        });
    });

    describe('createMemberJoinEmbed', () => {
        it('should create join embed with member info', () => {
            const member = createMockMember({
                user: createMockUser({
                    tag: 'NewUser#0001',
                    id: '123456789',
                    createdTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
                }),
                guild: createMockGuild({ memberCount: 150 })
            });

            const embed = createMemberJoinEmbed(member);
            const data = embed.toJSON();
            
            expect(data.title).toBe('📥 Member Joined');
            expect(data.description).toContain('NewUser#0001');
            expect(data.description).toContain('joined');
        });

        it('should include member count', () => {
            const member = createMockMember({
                guild: createMockGuild({ memberCount: 500 })
            });

            const embed = createMemberJoinEmbed(member);
            const data = embed.toJSON();
            
            const countField = data.fields.find(f => f.name === 'Member Count');
            expect(countField.value).toBe('500');
        });

        it('should flag new accounts', () => {
            const member = createMockMember({
                user: createMockUser({
                    createdTimestamp: Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
                })
            });

            const embed = createMemberJoinEmbed(member);
            const data = embed.toJSON();
            
            const warningField = data.fields.find(f => f.name.includes('Warning'));
            expect(warningField).toBeTruthy();
        });

        it('should not flag old accounts', () => {
            const member = createMockMember({
                user: createMockUser({
                    createdTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
                })
            });

            const embed = createMemberJoinEmbed(member);
            const data = embed.toJSON();
            
            const warningField = data.fields.find(f => f.name.includes('Warning'));
            expect(warningField).toBeFalsy();
        });
    });

    describe('createMemberLeaveEmbed', () => {
        it('should create leave embed with member info', () => {
            const member = createMockMember({
                user: createMockUser({ tag: 'LeavingUser#0001' }),
                joinedTimestamp: Date.now() - (14 * 24 * 60 * 60 * 1000) // 14 days ago
            });

            const embed = createMemberLeaveEmbed(member);
            const data = embed.toJSON();
            
            expect(data.title).toBe('📤 Member Left');
            expect(data.description).toContain('LeavingUser#0001');
        });

        it('should show time in server', () => {
            const member = createMockMember({
                joinedTimestamp: Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
            });

            const embed = createMemberLeaveEmbed(member);
            const data = embed.toJSON();
            
            const timeField = data.fields.find(f => f.name === 'Time in Server');
            expect(timeField.value).toContain('30');
        });

        it('should show roles', () => {
            const guild = createMockGuild({ id: 'guild123' });
            const rolesCache = new Map([
                ['role1', { id: 'role1', name: 'Moderator' }],
                ['role2', { id: 'role2', name: 'VIP' }],
                ['guild123', { id: 'guild123', name: '@everyone' }]
            ]);
            
            const member = createMockMember({
                guild,
                roles: rolesCache
            });
            // Override the roles property
            member.roles = {
                cache: rolesCache
            };

            const embed = createMemberLeaveEmbed(member);
            const data = embed.toJSON();
            
            const rolesField = data.fields.find(f => f.name === 'Roles');
            expect(rolesField.value).toContain('Moderator');
            expect(rolesField.value).toContain('VIP');
            expect(rolesField.value).not.toContain('@everyone');
        });

        it('should handle unknown join time', () => {
            const member = createMockMember({
                joinedTimestamp: null
            });

            const embed = createMemberLeaveEmbed(member);
            const data = embed.toJSON();
            
            const timeField = data.fields.find(f => f.name === 'Time in Server');
            expect(timeField.value).toBe('Unknown days');
        });
    });

    describe('createRoleChangeEmbed', () => {
        it('should return null when no role changes', () => {
            const roles = new Map([['role1', { id: 'role1', name: 'Test' }]]);
            const oldMember = createMockMember();
            const newMember = createMockMember();
            oldMember.roles = { cache: roles };
            newMember.roles = { cache: roles };

            const embed = createRoleChangeEmbed(oldMember, newMember);
            expect(embed).toBeNull();
        });

        it('should show added roles', () => {
            const oldRoles = new Map();
            const newRoles = new Map([
                ['role1', { id: 'role1', name: 'NewRole' }]
            ]);
            
            const oldMember = createMockMember();
            const newMember = createMockMember();
            oldMember.roles = { cache: oldRoles };
            newMember.roles = { cache: newRoles };

            const embed = createRoleChangeEmbed(oldMember, newMember);
            const data = embed.toJSON();
            
            expect(data.title).toBe('🏷️ Role Update');
            const addedField = data.fields.find(f => f.name.includes('Added'));
            expect(addedField.value).toContain('NewRole');
        });

        it('should show removed roles', () => {
            const oldRoles = new Map([
                ['role1', { id: 'role1', name: 'OldRole' }]
            ]);
            const newRoles = new Map();
            
            const oldMember = createMockMember();
            const newMember = createMockMember();
            oldMember.roles = { cache: oldRoles };
            newMember.roles = { cache: newRoles };

            const embed = createRoleChangeEmbed(oldMember, newMember);
            const data = embed.toJSON();
            
            const removedField = data.fields.find(f => f.name.includes('Removed'));
            expect(removedField.value).toContain('OldRole');
        });

        it('should show both added and removed roles', () => {
            const oldRoles = new Map([
                ['role1', { id: 'role1', name: 'Removed' }]
            ]);
            const newRoles = new Map([
                ['role2', { id: 'role2', name: 'Added' }]
            ]);
            
            const oldMember = createMockMember();
            const newMember = createMockMember();
            oldMember.roles = { cache: oldRoles };
            newMember.roles = { cache: newRoles };

            const embed = createRoleChangeEmbed(oldMember, newMember);
            const data = embed.toJSON();
            
            const addedField = data.fields.find(f => f.name.includes('Added'));
            const removedField = data.fields.find(f => f.name.includes('Removed'));
            expect(addedField).toBeTruthy();
            expect(removedField).toBeTruthy();
        });
    });

    describe('createVoiceChangeEmbed', () => {
        it('should return null when no member', () => {
            const oldState = createMockVoiceState({ member: null });
            const newState = createMockVoiceState({ member: null });

            const embed = createVoiceChangeEmbed(oldState, newState);
            expect(embed).toBeNull();
        });

        it('should create embed for joining voice channel', () => {
            const member = createMockMember({
                user: createMockUser({ tag: 'VoiceUser#0001' })
            });
            const channel = createMockChannel({ name: 'General Voice' });
            
            const oldState = createMockVoiceState({ member, channel: null });
            const newState = createMockVoiceState({ member, channel });

            const embed = createVoiceChangeEmbed(oldState, newState);
            const data = embed.toJSON();
            
            expect(data.title).toBe('🔊 Voice Channel Joined');
            expect(data.description).toContain('VoiceUser#0001');
        });

        it('should create embed for leaving voice channel', () => {
            const member = createMockMember();
            const channel = createMockChannel({ name: 'General Voice' });
            
            const oldState = createMockVoiceState({ member, channel });
            const newState = createMockVoiceState({ member, channel: null });

            const embed = createVoiceChangeEmbed(oldState, newState);
            const data = embed.toJSON();
            
            expect(data.title).toBe('🔇 Voice Channel Left');
        });

        it('should create embed for moving voice channels', () => {
            const member = createMockMember();
            const oldChannel = createMockChannel({ id: '111', name: 'Old Channel' });
            const newChannel = createMockChannel({ id: '222', name: 'New Channel' });
            
            const oldState = createMockVoiceState({ member, channel: oldChannel });
            const newState = createMockVoiceState({ member, channel: newChannel });

            const embed = createVoiceChangeEmbed(oldState, newState);
            const data = embed.toJSON();
            
            expect(data.title).toBe('🔀 Voice Channel Moved');
            
            const fromField = data.fields.find(f => f.name === 'From');
            const toField = data.fields.find(f => f.name === 'To');
            expect(fromField.value).toBe('Old Channel');
            expect(toField.value).toBe('New Channel');
        });

        it('should return null for other state changes', () => {
            const member = createMockMember();
            const channel = createMockChannel({ id: '111', name: 'Same Channel' });
            
            // Same channel, just mute/deafen change
            const oldState = createMockVoiceState({ member, channel });
            const newState = createMockVoiceState({ member, channel });

            const embed = createVoiceChangeEmbed(oldState, newState);
            expect(embed).toBeNull();
        });
    });
});
