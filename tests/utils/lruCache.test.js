import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCache, TwoLevelLRUCache } from '../../src/utils/lruCache.js';

describe('LRUCache', () => {
    let cache;

    beforeEach(() => {
        cache = new LRUCache({ maxSize: 3 });
    });

    afterEach(() => {
        cache.clear();
    });

    it('should set and get values', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        
        expect(cache.get('a')).toBe(1);
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBeUndefined();
    });

    it('should update existing key', () => {
        cache.set('a', 1);
        cache.set('a', 2);
        
        expect(cache.get('a')).toBe(2);
        expect(cache.getSize()).toBe(1);
    });

    it('should evict LRU when max size exceeded', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4); // Should evict 'a'
        
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
    });

    it('should move accessed key to MRU', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        
        // Access 'a' to make it MRU
        cache.get('a');
        
        // Add 'd' - should evict 'b' (now LRU)
        cache.set('d', 4);
        
        expect(cache.get('a')).toBe(1);
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
    });

    it('should delete keys', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        
        expect(cache.delete('a')).toBe(true);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.getSize()).toBe(1);
        
        expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        
        cache.clear();
        
        expect(cache.getSize()).toBe(0);
        expect(cache.get('a')).toBeUndefined();
    });

    it('should return keys in LRU order (MRU first)', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        
        // Access 'a' to make it MRU
        cache.get('a');
        
        const keys = cache.keys();
        expect(keys[0]).toBe('a'); // MRU
        expect(keys[1]).toBe('c');
        expect(keys[2]).toBe('b'); // LRU
    });

    it('should call onEvict callback', () => {
        const evicted = [];
        const cache = new LRUCache({ 
            maxSize: 2,
            onEvict: (key, value) => evicted.push({ key, value })
        });
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3); // Should evict 'a'
        
        expect(evicted).toHaveLength(1);
        expect(evicted[0]).toEqual({ key: 'a', value: 1 });
    });

    it('should handle has() correctly', () => {
        cache.set('a', 1);
        
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
    });

    it('should return entries in LRU order', () => {
        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a'); // Make 'a' MRU
        
        const entries = cache.entries();
        expect(entries[0]).toEqual({ key: 'a', value: 1 });
        expect(entries[1]).toEqual({ key: 'b', value: 2 });
    });
});

describe('TwoLevelLRUCache', () => {
    let cache;

    beforeEach(() => {
        cache = new TwoLevelLRUCache({
            maxGuilds: 2,
            maxUsersPerGuild: 2,
            maxTotalUsers: 4
        });
    });

    afterEach(() => {
        cache.clear();
    });

    it('should set and get values for guild+user', () => {
        cache.set('guild1', 'user1', { messages: [1000] });
        cache.set('guild1', 'user2', { messages: [2000] });
        
        expect(cache.get('guild1', 'user1')).toEqual({ messages: [1000] });
        expect(cache.get('guild1', 'user2')).toEqual({ messages: [2000] });
        expect(cache.get('guild2', 'user1')).toBeUndefined();
    });

    it('should evict LRU user within guild', () => {
        cache.set('guild1', 'user1', { messages: [1000] });
        cache.set('guild1', 'user2', { messages: [2000] });
        cache.set('guild1', 'user3', { messages: [3000] }); // Should evict user1
        
        expect(cache.get('guild1', 'user1')).toBeUndefined();
        expect(cache.get('guild1', 'user2')).toEqual({ messages: [2000] });
        expect(cache.get('guild1', 'user3')).toEqual({ messages: [3000] });
    });

    it('should evict LRU guild when maxGuilds exceeded', () => {
        cache.set('guild1', 'user1', { messages: [1000] });
        cache.set('guild2', 'user1', { messages: [2000] });
        cache.set('guild3', 'user1', { messages: [3000] }); // Should evict guild1
        
        expect(cache.get('guild1', 'user1')).toBeUndefined();
        expect(cache.get('guild2', 'user1')).toEqual({ messages: [2000] });
        expect(cache.get('guild3', 'user1')).toEqual({ messages: [3000] });
    });

    it('should track total users across guilds', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild1', 'user2', {});
        cache.set('guild2', 'user1', {});
        
        expect(cache.getTotalUsers()).toBe(3);
        expect(cache.getGuildCount()).toBe(2);
    });

    it('should enforce maxTotalUsers limit', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild1', 'user2', {});
        cache.set('guild2', 'user1', {});
        cache.set('guild2', 'user2', {});
        cache.set('guild3', 'user1', {}); // Total = 5, max = 4
        
        // Should have evicted some users
        expect(cache.getTotalUsers()).toBeLessThanOrEqual(4);
    });

    it('should delete specific guild+user', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild1', 'user2', {});
        
        expect(cache.delete('guild1', 'user1')).toBe(true);
        expect(cache.get('guild1', 'user1')).toBeUndefined();
        expect(cache.getTotalUsers()).toBe(1);
        
        expect(cache.delete('guild1', 'nonexistent')).toBe(false);
    });

    it('should clean up empty guilds', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild1', 'user2', {});
        
        cache.delete('guild1', 'user1');
        cache.delete('guild1', 'user2');
        
        // Guild should be cleaned up
        expect(cache.getGuildCount()).toBe(0);
    });

    it('should return correct guild size', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild1', 'user2', {});
        cache.set('guild2', 'user1', {});
        
        expect(cache.getGuildSize('guild1')).toBe(2);
        expect(cache.getGuildSize('guild2')).toBe(1);
        expect(cache.getGuildSize('guild3')).toBe(0);
    });

    it('should clear all entries', () => {
        cache.set('guild1', 'user1', {});
        cache.set('guild2', 'user1', {});
        
        cache.clear();
        
        expect(cache.getTotalUsers()).toBe(0);
        expect(cache.getGuildCount()).toBe(0);
    });

    it('should call onEvict callback', () => {
        const evicted = [];
        const cache = new TwoLevelLRUCache({
            maxGuilds: 1,
            maxUsersPerGuild: 1,
            maxTotalUsers: 1,
            onEvict: (guildId, userId, value) => evicted.push({ guildId, userId, value })
        });
        
        cache.set('guild1', 'user1', { data: 'test' });
        cache.set('guild1', 'user2', { data: 'test2' }); // Should evict user1
        
        expect(evicted).toHaveLength(1);
        expect(evicted[0]).toEqual({ 
            guildId: 'guild1', 
            userId: 'user1', 
            value: { data: 'test' }
        });
    });
});