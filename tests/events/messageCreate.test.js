// Message Create Event Tests
// Tests for the messageCreate event handler (automod)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import messageCreateEvent from '../../src/events/messageCreate.js';
import { 
    createMockMessage,
    createMockUser, 
    createMockGuild,
    createMockChannel,
    createMockClient,
    createMockMember
} from '../mocks/discord.js';

// Mock the automod module
vi.mock('../../src/utils/automod.js', () => ({
    getAutomodConfig: vi.fn(),
    isExempt: vi.fn().mockReturnValue(false),
    isChannelExempt: vi.fn().mockReturnValue(false),
    checkBannedWords: vi.fn().mockReturnValue(null),
    checkInvites: vi.fn().mockReturnValue(false),
    checkLinks: vi.fn().mockReturnValue(false),
    checkMentionSpam: vi.fn().mockReturnValue(false),
    checkCapsSpam: vi.fn().mockReturnValue(false),
    checkSpam: vi.fn().mockReturnValue(false),
    checkAccountAge: vi.fn().mockReturnValue(false)
}));

// Mock the dataStore module
vi.mock('../../src/utils/dataStore.js', () => ({
    appendToUserArray: vi.fn(),
    generateId: vi.fn().mockReturnValue('test-warning-id'),
    getUserData: vi.fn().mockReturnValue([]),
    getGuildData: vi.fn().mockReturnValue({})
}));

// Mock the modLog module
vi.mock('../../src/utils/modLog.js', () => ({
    sendModLog: vi.fn().mockResolvedValue(undefined)
}));

// Mock the config
vi.mock('../../src/config/config.js', () => ({
    config: {
        warnings: {
            thresholds: { mute: 3, kick: 5, ban: 7 },
            muteDuration: 3600000
        }
    }
}));

import { 
    getAutomodConfig, 
    isExempt, 
    isChannelExempt,
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkSpam,
    checkAccountAge
} from '../../src/utils/automod.js';
import { appendToUserArray, getUserData, getGuildData } from '../../src/utils/dataStore.js';
import { sendModLog } from '../../src/utils/modLog.js';

describe('MessageCreate Event', () => {
    let mockMessage;
    let mockGuild;
    let mockClient;
    let mockChannel;
    let automodConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        
        mockChannel = createMockChannel({
            id: '111222333',
            name: 'general',
            send: vi.fn().mockResolvedValue({ delete: vi.fn() })
        });
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server',
            bans: {
                create: vi.fn().mockResolvedValue({})
            }
        });
        
        mockClient = createMockClient();
        
        const mockMember = createMockMember({
            kickable: true,
            moderatable: true
        });
        
        mockMessage = createMockMessage({
            id: '777888999',
            content: 'Hello world',
            author: createMockUser({ id: '123456789', tag: 'TestUser#0001', bot: false }),
            guild: mockGuild,
            channel: mockChannel,
            member: mockMember,
            deletable: true
        });
        
        automodConfig = {
            enabled: true,
            bannedWords: [],
            maxMentions: 5,
            maxCapsPercent: 70,
            minCapsLength: 10,
            minAccountAge: 0,
            filterInvites: false,
            filterLinks: false,
            spamThreshold: 0,
            spamInterval: 5000
        };
        
        getAutomodConfig.mockReturnValue(automodConfig);
    });

    describe('Event Metadata', () => {
        it('should have correct name', () => {
            expect(messageCreateEvent.name).toBe('messageCreate');
        });

        it('should not be a once event', () => {
            expect(messageCreateEvent.once).toBe(false);
        });
    });

    describe('Message Filtering', () => {
        it('should ignore DM messages', async () => {
            mockMessage.guild = null;
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(getAutomodConfig).not.toHaveBeenCalled();
        });

        it('should ignore bot messages', async () => {
            mockMessage.author.bot = true;
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(getAutomodConfig).not.toHaveBeenCalled();
        });

        it('should skip if automod is disabled', async () => {
            automodConfig.enabled = false;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).not.toHaveBeenCalled();
        });

        it('should skip if channel is exempt', async () => {
            isChannelExempt.mockReturnValue(true);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).not.toHaveBeenCalled();
        });

        it('should skip if member is exempt', async () => {
            isExempt.mockReturnValue(true);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).not.toHaveBeenCalled();
        });

        it('should skip if member is null', async () => {
            mockMessage.member = null;
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).not.toHaveBeenCalled();
        });
    });

    describe('Banned Words Check', () => {
        it('should check for banned words when configured', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).toHaveBeenCalledWith('Hello world', ['badword']);
        });

        it('should delete message and warn user on banned word', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockReturnValue('badword');
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.delete).toHaveBeenCalled();
            expect(appendToUserArray).toHaveBeenCalledWith(
                'warnings',
                '987654321',
                '123456789',
                expect.objectContaining({
                    reason: expect.stringContaining('AUTOMOD'),
                    automod: true,
                    violationType: 'banned_word'
                })
            );
        });

        it('should not check banned words when list is empty', async () => {
            automodConfig.bannedWords = [];
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkBannedWords).not.toHaveBeenCalled();
        });
    });

    describe('Invite Links Check', () => {
        it('should check for invite links when enabled', async () => {
            automodConfig.filterInvites = true;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkInvites).toHaveBeenCalledWith('Hello world');
        });

        it('should delete message on invite link detection', async () => {
            automodConfig.filterInvites = true;
            getAutomodConfig.mockReturnValue(automodConfig);
            checkInvites.mockReturnValue(true);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.delete).toHaveBeenCalled();
            expect(appendToUserArray).toHaveBeenCalledWith(
                'warnings',
                expect.any(String),
                expect.any(String),
                expect.objectContaining({
                    violationType: 'invite_link'
                })
            );
        });
    });

    describe('External Links Check', () => {
        it('should check for external links when enabled', async () => {
            automodConfig.filterLinks = true;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkLinks).toHaveBeenCalledWith('Hello world');
        });

        it('should delete message on external link detection', async () => {
            automodConfig.filterLinks = true;
            getAutomodConfig.mockReturnValue(automodConfig);
            checkLinks.mockReturnValue(true);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.delete).toHaveBeenCalled();
        });
    });

    describe('Mention Spam Check', () => {
        it('should check for mention spam when threshold > 0', async () => {
            automodConfig.maxMentions = 5;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkMentionSpam).toHaveBeenCalledWith(mockMessage, 5);
        });

        it('should not check mentions when maxMentions is 0', async () => {
            automodConfig.maxMentions = 0;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkMentionSpam).not.toHaveBeenCalled();
        });
    });

    describe('Caps Spam Check', () => {
        it('should check for caps spam when threshold < 100', async () => {
            automodConfig.maxCapsPercent = 70;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkCapsSpam).toHaveBeenCalledWith('Hello world', 70, 10);
        });

        it('should not check caps when maxCapsPercent is 100', async () => {
            automodConfig.maxCapsPercent = 100;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkCapsSpam).not.toHaveBeenCalled();
        });
    });

    describe('Message Spam Check', () => {
        it('should check for spam when threshold > 0', async () => {
            automodConfig.spamThreshold = 5;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkSpam).toHaveBeenCalledWith(mockMessage, 5, 5000);
        });

        it('should not check spam when threshold is 0', async () => {
            automodConfig.spamThreshold = 0;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkSpam).not.toHaveBeenCalled();
        });
    });

    describe('Account Age Check', () => {
        it('should check account age when minAccountAge > 0', async () => {
            automodConfig.minAccountAge = 7;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkAccountAge).toHaveBeenCalledWith(mockMessage.author, 7);
        });

        it('should not check account age when minAccountAge is 0', async () => {
            automodConfig.minAccountAge = 0;
            getAutomodConfig.mockReturnValue(automodConfig);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(checkAccountAge).not.toHaveBeenCalled();
        });
    });

    describe('Auto-Punishment Thresholds', () => {
        it('should auto-mute at mute threshold', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockReturnValue('badword');
            getUserData.mockReturnValue([
                { active: true },
                { active: true },
                { active: true }
            ]);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.member.timeout).toHaveBeenCalled();
        });

        it('should auto-kick at kick threshold', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockReturnValue('badword');
            getUserData.mockReturnValue([
                { active: true },
                { active: true },
                { active: true },
                { active: true },
                { active: true }
            ]);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockMessage.member.kick).toHaveBeenCalled();
        });

        it('should auto-ban at ban threshold', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockReturnValue('badword');
            getUserData.mockReturnValue([
                { active: true },
                { active: true },
                { active: true },
                { active: true },
                { active: true },
                { active: true },
                { active: true }
            ]);
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(mockGuild.bans.create).toHaveBeenCalled();
        });
    });

    describe('Mod Logging', () => {
        it('should send mod log on violation', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockReturnValue('badword');
            
            await messageCreateEvent.execute(mockMessage, mockClient);
            
            expect(sendModLog).toHaveBeenCalledWith(
                mockGuild,
                expect.objectContaining({
                    action: 'automod',
                    target: mockMessage.author,
                    moderator: mockClient.user
                })
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle errors gracefully', async () => {
            automodConfig.bannedWords = ['badword'];
            getAutomodConfig.mockReturnValue(automodConfig);
            checkBannedWords.mockImplementation(() => {
                throw new Error('Check failed');
            });
            
            await expect(
                messageCreateEvent.execute(mockMessage, mockClient)
            ).resolves.not.toThrow();
        });
    });
});
