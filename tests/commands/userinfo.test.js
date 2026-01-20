// User Info Command Tests
// Tests for the userinfo command functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userinfoCommand from '../../src/commands/userinfo.js';
import { 
    createMockInteraction, 
    createMockUser, 
    createMockMember,
    createMockGuild
} from '../mocks/discord.js';

describe('Userinfo Command', () => {
    let mockInteraction;
    let targetUser;
    let targetMember;
    let mockGuild;

    beforeEach(() => {
        vi.clearAllMocks();
        
        const createdTimestamp = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
        const joinedTimestamp = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
        
        targetUser = createMockUser({ 
            id: '111222333', 
            tag: 'TestUser#0001',
            username: 'TestUser',
            discriminator: '0001',
            bot: false,
            createdTimestamp,
            displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatars/111222333/avatar.png')
        });
        
        const topRole = {
            id: 'top-role-123',
            name: 'Admin',
            toString: () => '<@&top-role-123>'
        };
        
        targetMember = createMockMember({
            user: targetUser,
            joinedTimestamp,
            displayColor: 0x3498db,
            displayHexColor: '#3498db',
            presence: { status: 'online' },
            roles: {
                cache: {
                    size: 5
                },
                highest: topRole
            }
        });
        
        // Create members cache for position calculation
        const membersCache = new Map();
        membersCache.set('111222333', targetMember);
        membersCache.set('222333444', createMockMember({ joinedTimestamp: joinedTimestamp - 1000 }));
        
        mockGuild = createMockGuild({
            memberCount: 100,
            members: {
                cache: {
                    get: vi.fn().mockReturnValue(targetMember),
                    filter: vi.fn().mockReturnValue({
                        sort: vi.fn().mockReturnValue({
                            map: vi.fn().mockReturnValue(['222333444', '111222333']),
                            indexOf: vi.fn().mockReturnValue(1)
                        })
                    })
                },
                fetch: vi.fn().mockResolvedValue(targetMember)
            }
        });
        
        mockInteraction = createMockInteraction({
            user: createMockUser({ 
                id: '999888777', 
                tag: 'Requester#0001',
                displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatars/999888777/avatar.png')
            }),
            guild: mockGuild,
            options: {
                getUser: vi.fn().mockReturnValue(targetUser)
            }
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(userinfoCommand.name).toBe('userinfo');
        });

        it('should have a description', () => {
            expect(userinfoCommand.description).toBeTruthy();
        });

        it('should be in Utility category', () => {
            expect(userinfoCommand.category).toBe('Utility');
        });

        it('should have correct options', () => {
            expect(userinfoCommand.options).toHaveLength(1);
            
            const userOption = userinfoCommand.options.find(o => o.name === 'user');
            expect(userOption.required).toBe(false);
        });
    });

    describe('execute - Success Cases', () => {
        it('should display user info successfully', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds.length).toBe(1);
        });

        it('should include user information in embed', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            
            expect(embed.data.title).toContain('User Information');
        });

        it('should display username field', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const usernameField = fields.find(f => f.name === 'Username');
            expect(usernameField).toBeDefined();
            expect(usernameField.value).toContain('TestUser');
        });

        it('should display user ID field', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const idField = fields.find(f => f.name === 'User ID');
            expect(idField).toBeDefined();
            expect(idField.value).toContain('111222333');
        });

        it('should display bot status field', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const botField = fields.find(f => f.name === 'Bot');
            expect(botField).toBeDefined();
            expect(botField.value).toBe('No');
        });

        it('should display account creation date', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const createdField = fields.find(f => f.name === 'Account Created');
            expect(createdField).toBeDefined();
            expect(createdField.value).toContain('days ago');
        });

        it('should display server join date', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const joinedField = fields.find(f => f.name === 'Joined Server');
            expect(joinedField).toBeDefined();
            expect(joinedField.value).toContain('days ago');
        });

        it('should display top role', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const roleField = fields.find(f => f.name === 'Top Role');
            expect(roleField).toBeDefined();
        });

        it('should display role count', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const roleCountField = fields.find(f => f.name === 'Role Count');
            expect(roleCountField).toBeDefined();
            expect(roleCountField.value).toContain('4 role(s)'); // size - 1 for @everyone
        });

        it('should use interaction user when no target specified', async () => {
            mockInteraction.options.getUser.mockReturnValue(null);
            mockGuild.members.cache.get.mockReturnValue(targetMember);
            
            await userinfoCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        it('should include avatar thumbnail', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.thumbnail).toBeDefined();
        });

        it('should include footer with requester info', async () => {
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.footer.text).toContain('Requested by');
        });
    });

    describe('execute - Status Indicators', () => {
        it('should show online status', async () => {
            targetMember.presence = { status: 'online' };
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[ONLINE]');
        });

        it('should show idle status', async () => {
            targetMember.presence = { status: 'idle' };
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[IDLE]');
        });

        it('should show dnd status', async () => {
            targetMember.presence = { status: 'dnd' };
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[DND]');
        });

        it('should show offline status', async () => {
            targetMember.presence = { status: 'offline' };
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[OFFLINE]');
        });

        it('should show offline when presence is null', async () => {
            targetMember.presence = null;
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('[OFFLINE]');
        });
    });

    describe('execute - Bot Detection', () => {
        it('should show Yes for bot users', async () => {
            targetUser.bot = true;
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const botField = fields.find(f => f.name === 'Bot');
            expect(botField.value).toBe('Yes');
        });
    });

    describe('execute - Error Cases', () => {
        it('should handle member not found', async () => {
            mockGuild.members.cache.get.mockReturnValue(null);
            mockGuild.members.fetch.mockResolvedValue(null);
            
            await userinfoCommand.execute(mockInteraction);
            
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('[ERROR]');
            expect(replyCall.ephemeral).toBe(true);
        });
    });

    describe('execute - Display Color', () => {
        it('should use member display color when available', async () => {
            targetMember.displayColor = 0x3498db;
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            // Color should be set
            expect(replyCall.embeds[0].data.color).toBeDefined();
        });

        it('should use default color when display color is 0', async () => {
            targetMember.displayColor = 0;
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            // Should still have default color
            expect(replyCall.embeds[0].data.color).toBeDefined();
        });
    });

    describe('execute - Discriminator Handling', () => {
        it('should show discriminator when not 0', async () => {
            targetUser.discriminator = '1234';
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const usernameField = fields.find(f => f.name === 'Username');
            expect(usernameField.value).toContain('#1234');
        });

        it('should not show discriminator when 0', async () => {
            targetUser.discriminator = '0';
            
            await userinfoCommand.execute(mockInteraction);
            
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;
            const usernameField = fields.find(f => f.name === 'Username');
            expect(usernameField.value).not.toContain('#0');
        });
    });
});
