// XP Utility Tests
// Tests for the XP award functions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateXPForLevel, isOnCooldown, awardXp, clearCooldowns, getLevelsConfig } from '../../src/utils/xp.js';

vi.mock('../../src/utils/db.js', () => ({
    getUserData: vi.fn(),
    setUserData: vi.fn(),
    getGuildData: vi.fn()
}));

vi.mock('../../src/config/config.js', () => ({
    config: {
        levels: {
            enabled: true,
            cooldown: 60000,
            minXp: 15,
            maxXp: 25,
            announceLevelUp: true
        }
    }
}));

import { getUserData, setUserData, getGuildData } from '../../src/utils/db.js';

describe('XP Utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCooldowns();
        getUserData.mockResolvedValue(undefined);
        setUserData.mockResolvedValue(undefined);
        getGuildData.mockResolvedValue({});
    });

    describe('calculateXPForLevel', () => {
        it('should require 0 XP for level 0', () => {
            expect(calculateXPForLevel(0)).toBe(0);
        });

        it('should require 100 XP for level 1', () => {
            expect(calculateXPForLevel(1)).toBe(100);
        });

        it('should require increasing XP for higher levels', () => {
            const lvl1 = calculateXPForLevel(1);
            const lvl2 = calculateXPForLevel(2);
            const lvl3 = calculateXPForLevel(3);
            expect(lvl2).toBeGreaterThan(lvl1);
            expect(lvl3).toBeGreaterThan(lvl2);
        });
    });

    describe('isOnCooldown', () => {
        it('should allow the first award immediately', () => {
            expect(isOnCooldown('g1', 'u1', 60000)).toBe(false);
        });

        it('should block a second award within the cooldown window', () => {
            isOnCooldown('g1', 'u1', 60000);
            expect(isOnCooldown('g1', 'u1', 60000)).toBe(true);
        });

        it('should allow different users independently', () => {
            isOnCooldown('g1', 'u1', 60000);
            expect(isOnCooldown('g1', 'u2', 60000)).toBe(false);
        });

        it('should allow awards after the cooldown expires', () => {
            vi.useFakeTimers();
            try {
                isOnCooldown('g1', 'u1', 60000);
                vi.advanceTimersByTime(60001);
                expect(isOnCooldown('g1', 'u1', 60000)).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('awardXp', () => {
        it('should create level data for a new user', async() => {
            getUserData.mockResolvedValue(undefined);
            
            const result = await awardXp('g1', 'u1', 20);
            
            expect(result.data.xp).toBe(20);
            expect(result.data.level).toBe(0);
            expect(result.data.messages).toBe(1);
            expect(result.leveledUp).toBe(false);
            expect(setUserData).toHaveBeenCalledWith('levels', 'g1', 'u1', expect.objectContaining({ xp: 20, messages: 1 }));
        });

        it('should accumulate XP for an existing user', async() => {
            getUserData.mockResolvedValue({ xp: 50, level: 0, messages: 3 });
            
            const result = await awardXp('g1', 'u1', 20);
            
            expect(result.data.xp).toBe(70);
            expect(result.data.messages).toBe(4);
            expect(result.leveledUp).toBe(false);
        });

        it('should level up when XP reaches the next level threshold', async() => {
            getUserData.mockResolvedValue({ xp: 90, level: 0, messages: 1 });
            
            const result = await awardXp('g1', 'u1', 20);
            
            expect(result.data.xp).toBe(110);
            expect(result.data.level).toBe(1);
            expect(result.leveledUp).toBe(true);
        });

        it('should not increment messages when incrementMessages is false', async() => {
            getUserData.mockResolvedValue({ xp: 10, level: 0, messages: 5 });
            
            const result = await awardXp('g1', 'u1', 15, false);
            
            expect(result.data.messages).toBe(5);
            expect(result.data.xp).toBe(25);
        });
    });

    describe('getLevelsConfig', () => {
        it('should return config defaults when no guild config exists', async() => {
            getGuildData.mockResolvedValue({});
            
            const cfg = await getLevelsConfig('g1');
            
            expect(cfg.enabled).toBe(true);
            expect(cfg.cooldown).toBe(60000);
            expect(cfg.minXp).toBe(15);
            expect(cfg.maxXp).toBe(25);
            expect(cfg.announceLevelUp).toBe(true);
        });

        it('should use guild config overrides', async() => {
            getGuildData.mockResolvedValue({ enabled: false, cooldown: 5000, minXp: 10, maxXp: 30 });
            
            const cfg = await getLevelsConfig('g1');
            
            expect(cfg.enabled).toBe(false);
            expect(cfg.cooldown).toBe(5000);
            expect(cfg.minXp).toBe(10);
            expect(cfg.maxXp).toBe(30);
            expect(cfg.announceLevelUp).toBe(true);
        });
    });
});
