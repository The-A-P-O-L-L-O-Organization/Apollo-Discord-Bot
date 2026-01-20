// Automod Utility Tests
// Tests for the automod checking functions

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkAccountAge,
    isChannelExempt
} from '../../src/utils/automod.js';
import { createMockMessage, createMockUser, createMockMember } from '../mocks/discord.js';

describe('Automod Utility', () => {
    describe('checkBannedWords', () => {
        it('should return null when bannedWords is empty', () => {
            const result = checkBannedWords('hello world', []);
            expect(result).toBeNull();
        });

        it('should detect banned word in content', () => {
            const result = checkBannedWords('this is a badword here', ['badword']);
            expect(result).toBe('badword');
        });

        it('should be case insensitive', () => {
            const result = checkBannedWords('This has BADWORD in it', ['badword']);
            expect(result).toBe('badword');
        });

        it('should detect first matching banned word', () => {
            const result = checkBannedWords('this has bad1 and bad2', ['bad1', 'bad2']);
            expect(result).toBe('bad1');
        });

        it('should not match partial words', () => {
            const result = checkBannedWords('this is badwording', ['bad']);
            expect(result).toBeNull();
        });

        it('should match word boundaries', () => {
            const result = checkBannedWords('the word bad is here', ['bad']);
            expect(result).toBe('bad');
        });

        it('should handle special regex characters in banned words', () => {
            const result = checkBannedWords('use .* for regex', ['.*']);
            expect(result).toBeNull(); // .* as a word shouldn't match everything
        });

        it('should return null when no banned words match', () => {
            const result = checkBannedWords('this is clean content', ['bad', 'evil', 'naughty']);
            expect(result).toBeNull();
        });
    });

    describe('checkInvites', () => {
        it('should detect discord.gg invites', () => {
            const result = checkInvites('Join us at discord.gg/abc123');
            expect(result).toBe(true);
        });

        it('should detect discord.com/invite links', () => {
            const result = checkInvites('Check out discord.com/invite/xyz789');
            expect(result).toBe(true);
        });

        it('should detect discordapp.com/invite links', () => {
            const result = checkInvites('Link: discordapp.com/invite/test');
            expect(result).toBe(true);
        });

        it('should be case insensitive', () => {
            const result = checkInvites('DISCORD.GG/ABC123');
            expect(result).toBe(true);
        });

        it('should return false for messages without invites', () => {
            const result = checkInvites('This is a normal message');
            expect(result).toBe(false);
        });

        it('should return false for partial matches', () => {
            const result = checkInvites('I love discord.gg but no invite code');
            expect(result).toBe(false);
        });
    });

    describe('checkLinks', () => {
        it('should detect http links', () => {
            const result = checkLinks('Check out http://example.com');
            expect(result).toBe(true);
        });

        it('should detect https links', () => {
            const result = checkLinks('Visit https://secure.example.com/path');
            expect(result).toBe(true);
        });

        it('should be case insensitive', () => {
            const result = checkLinks('HTTPS://EXAMPLE.COM');
            expect(result).toBe(true);
        });

        it('should return false for messages without links', () => {
            const result = checkLinks('This is a normal message without links');
            expect(result).toBe(false);
        });

        it('should return false for incomplete URLs', () => {
            const result = checkLinks('Visit example.com for more');
            expect(result).toBe(false);
        });
    });

    describe('checkMentionSpam', () => {
        it('should return false when mentions are below threshold', () => {
            const message = createMockMessage({
                mentionedUsers: new Map([['1', {}], ['2', {}]]),
                mentionedRoles: new Map(),
                mentionEveryone: false
            });
            message.mentions = {
                users: { size: 2 },
                roles: { size: 0 },
                everyone: false
            };

            const result = checkMentionSpam(message, 5);
            expect(result).toBe(false);
        });

        it('should return true when mentions exceed threshold', () => {
            const message = createMockMessage();
            message.mentions = {
                users: { size: 4 },
                roles: { size: 2 },
                everyone: false
            };

            const result = checkMentionSpam(message, 5);
            expect(result).toBe(true);
        });

        it('should count @everyone as a mention', () => {
            const message = createMockMessage();
            message.mentions = {
                users: { size: 3 },
                roles: { size: 2 },
                everyone: true
            };

            const result = checkMentionSpam(message, 5);
            expect(result).toBe(true);
        });

        it('should return false when exactly at threshold', () => {
            const message = createMockMessage();
            message.mentions = {
                users: { size: 3 },
                roles: { size: 2 },
                everyone: false
            };

            const result = checkMentionSpam(message, 5);
            expect(result).toBe(false);
        });
    });

    describe('checkCapsSpam', () => {
        it('should return false for short messages', () => {
            const result = checkCapsSpam('HI THERE', 70, 10);
            expect(result).toBe(false);
        });

        it('should return false when caps percentage is below threshold', () => {
            const result = checkCapsSpam('This is a normal message with some text', 70, 10);
            expect(result).toBe(false);
        });

        it('should return true when caps percentage exceeds threshold', () => {
            const result = checkCapsSpam('THIS IS A MESSAGE WITH LOTS OF CAPS HERE', 70, 10);
            expect(result).toBe(true);
        });

        it('should ignore non-alphabetic characters', () => {
            const result = checkCapsSpam('1234567890!@#$%^&*()', 70, 5);
            expect(result).toBe(false);
        });

        it('should handle mixed content correctly', () => {
            // "THIS IS A test" - 9 uppercase out of 12 letters = 75%
            const result = checkCapsSpam('THIS IS A test message here', 70, 10);
            expect(result).toBe(true);
        });

        it('should use default minLength of 10', () => {
            const result = checkCapsSpam('ABCDEFGH', 50); // 8 chars, below default 10
            expect(result).toBe(false);
        });
    });

    describe('checkAccountAge', () => {
        it('should return false when minDays is 0', () => {
            const user = createMockUser({
                createdTimestamp: Date.now() - 1000 // 1 second ago
            });
            const result = checkAccountAge(user, 0);
            expect(result).toBe(false);
        });

        it('should return true for new accounts', () => {
            const user = createMockUser({
                createdTimestamp: Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
            });
            const result = checkAccountAge(user, 7);
            expect(result).toBe(true);
        });

        it('should return false for old enough accounts', () => {
            const user = createMockUser({
                createdTimestamp: Date.now() - (10 * 24 * 60 * 60 * 1000) // 10 days ago
            });
            const result = checkAccountAge(user, 7);
            expect(result).toBe(false);
        });

        it('should return false for accounts exactly at threshold', () => {
            const user = createMockUser({
                createdTimestamp: Date.now() - (7 * 24 * 60 * 60 * 1000) // exactly 7 days ago
            });
            const result = checkAccountAge(user, 7);
            expect(result).toBe(false);
        });
    });

    describe('isChannelExempt', () => {
        it('should return true for exempt channels', () => {
            const cfg = {
                exemptChannels: ['123', '456', '789']
            };
            const result = isChannelExempt('456', cfg);
            expect(result).toBe(true);
        });

        it('should return false for non-exempt channels', () => {
            const cfg = {
                exemptChannels: ['123', '456', '789']
            };
            const result = isChannelExempt('999', cfg);
            expect(result).toBe(false);
        });

        it('should return false for empty exempt list', () => {
            const cfg = {
                exemptChannels: []
            };
            const result = isChannelExempt('123', cfg);
            expect(result).toBe(false);
        });
    });
});
