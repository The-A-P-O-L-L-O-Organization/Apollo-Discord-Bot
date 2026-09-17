// DataStore Utility Tests
// Tests for the data persistence functions

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// Mock the fs module
vi.mock('fs', () => ({
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
}));

// Need to dynamically import after mocking
let dataStore: typeof import('../../src/utils/dataStore.js');

describe('DataStore Utility', () => {
    beforeEach(async() => {
        vi.clearAllMocks();
        // Reset the module cache to get fresh imports with mocks
        vi.resetModules();
        
        // Set up default mock behaviors
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readFileSync).mockReturnValue('{}');
        
        // Import the module fresh
        dataStore = await import('../../src/utils/dataStore.js');
    });

    describe('getData', () => {
        it('should return empty object when file does not exist', () => {
            vi.mocked(existsSync).mockReturnValue(false);
            
            const result = dataStore.getData('nonexistent');
            expect(result).toEqual({});
        });

        it('should parse and return JSON data from file', () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ key: 'value' }));
            
            const result = dataStore.getData('testfile');
            expect(result).toEqual({ key: 'value' });
        });

        it('should return empty object on JSON parse error', () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('invalid json');
            
            const result = dataStore.getData('testfile');
            expect(result).toEqual({});
        });

        it('should return empty object on read error', () => {
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockImplementation(() => {
                throw new Error('Read error');
            });
            
            const result = dataStore.getData('testfile');
            expect(result).toEqual({});
        });
    });

    describe('setData', () => {
        it('should write JSON data to file', () => {
            const data = { test: 'data', nested: { value: 123 } };
            
            dataStore.setData('testfile', data);
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            expect(JSON.parse(content as string)).toEqual(data);
        });

        it('should handle write errors gracefully', () => {
            vi.mocked(writeFileSync).mockImplementation(() => {
                throw new Error('Write error');
            });
            
            // Should not throw
            expect(() => dataStore.setData('testfile', {})).not.toThrow();
        });
    });

    describe('getGuildData', () => {
        it('should return guild-specific data', () => {
            const mockData = {
                'guild123': { setting: 'value' },
                'guild456': { other: 'data' }
            };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockData));
            
            const result = dataStore.getGuildData('testfile', 'guild123');
            expect(result).toEqual({ setting: 'value' });
        });

        it('should return empty object for unknown guild', () => {
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ 'guild123': {} }));
            
            const result = dataStore.getGuildData('testfile', 'unknownGuild');
            expect(result).toEqual({});
        });
    });

    describe('setGuildData', () => {
        it('should set data for a specific guild', () => {
            const existingData = { 'otherGuild': { existing: 'data' } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            dataStore.setGuildData('testfile', 'newGuild', { new: 'data' });
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.newGuild).toEqual({ new: 'data' });
            expect(written.otherGuild).toEqual({ existing: 'data' });
        });
    });

    describe('updateGuildData', () => {
        it('should update a specific key in guild data', () => {
            const existingData = { 'guild123': { key1: 'value1' } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            dataStore.updateGuildData('testfile', 'guild123', 'key2', 'value2');
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.key1).toBe('value1');
            expect(written.guild123.key2).toBe('value2');
        });

        it('should create guild entry if it does not exist', () => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            dataStore.updateGuildData('testfile', 'newGuild', 'key', 'value');
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.newGuild.key).toBe('value');
        });
    });

    describe('appendToGuildArray', () => {
        it('should append item to existing array', () => {
            const existingData = { 'guild123': { items: ['item1', 'item2'] } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            dataStore.appendToGuildArray('testfile', 'guild123', 'items', 'item3');
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.items).toEqual(['item1', 'item2', 'item3']);
        });

        it('should create array if it does not exist', () => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            dataStore.appendToGuildArray('testfile', 'guild123', 'items', 'item1');
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.items).toEqual(['item1']);
        });

        it('should handle non-array values by replacing with array', () => {
            const existingData = { 'guild123': { items: 'not an array' } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            dataStore.appendToGuildArray('testfile', 'guild123', 'items', 'item1');
            
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.items).toEqual(['item1']);
        });
    });

    describe('removeFromGuildArray', () => {
        it('should remove items matching predicate', async() => {
            const existingData = { 
                'guild123': { 
                    items: [
                        { id: 1, name: 'keep' },
                        { id: 2, name: 'remove' },
                        { id: 3, name: 'keep' }
                    ] 
                } 
            };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const removed = await dataStore.removeFromGuildArray(
                'testfile', 
                'guild123', 
                'items', 
                (item: unknown) => (item as { name: string }).name === 'remove'
            );
            
            expect(removed).toBe(1);
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.items).toHaveLength(2);
            expect(written.guild123.items.every((i: { name: string }) => i.name === 'keep')).toBe(true);
        });

        it('should return 0 when guild does not exist', async() => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            const removed = await dataStore.removeFromGuildArray(
                'testfile', 
                'unknownGuild', 
                'items', 
                () => true
            );
            
            expect(removed).toBe(0);
            expect(writeFileSync).not.toHaveBeenCalled();
        });

        it('should return 0 when key is not an array', async() => {
            const existingData = { 'guild123': { items: 'not array' } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const removed = await dataStore.removeFromGuildArray(
                'testfile', 
                'guild123', 
                'items', 
                () => true
            );
            
            expect(removed).toBe(0);
        });

        it('should not write if nothing was removed', async() => {
            const existingData = { 'guild123': { items: [{ keep: true }] } };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const removed = await dataStore.removeFromGuildArray(
                'testfile', 
                'guild123', 
                'items', 
                () => false
            );
            
            expect(removed).toBe(0);
            expect(writeFileSync).not.toHaveBeenCalled();
        });
    });

    describe('getUserData', () => {
        it('should return user data within guild', () => {
            const existingData = { 
                'guild123': { 
                    'user456': { warnings: 3 } 
                } 
            };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const result = dataStore.getUserData('testfile', 'guild123', 'user456');
            expect(result).toEqual({ warnings: 3 });
        });

        it('should return undefined for unknown user', () => {
            const existingData = { 'guild123': {} };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const result = dataStore.getUserData('testfile', 'guild123', 'unknownUser');
            expect(result).toBeUndefined();
        });
    });

    describe('setUserData', () => {
        it('should set user data within guild', () => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            dataStore.setUserData('testfile', 'guild123', 'user456', { data: 'test' });
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.user456).toEqual({ data: 'test' });
        });
    });

    describe('appendToUserArray', () => {
        it('should append to user array within guild', () => {
            const existingData = { 
                'guild123': { 
                    'user456': ['item1'] 
                } 
            };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            dataStore.appendToUserArray('testfile', 'guild123', 'user456', 'item2');
            
            expect(writeFileSync).toHaveBeenCalled();
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.user456).toEqual(['item1', 'item2']);
        });

        it('should create user array if not exists', () => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            dataStore.appendToUserArray('testfile', 'guild123', 'user456', 'item1');
            
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.user456).toEqual(['item1']);
        });
    });

    describe('removeFromUserArray', () => {
        it('should remove items from user array', async() => {
            const existingData = { 
                'guild123': { 
                    'user456': [{ id: 1 }, { id: 2 }, { id: 3 }]
                } 
            };
            vi.mocked(readFileSync).mockReturnValue(JSON.stringify(existingData));
            
            const removed = await dataStore.removeFromUserArray(
                'testfile', 
                'guild123', 
                'user456', 
                (item: unknown) => (item as { id: number }).id === 2
            );
            
            expect(removed).toBe(1);
            const [, content] = vi.mocked(writeFileSync).mock.calls[0]!;
            const written = JSON.parse(content as string);
            expect(written.guild123.user456).toHaveLength(2);
        });

        it('should return 0 when user array does not exist', async() => {
            vi.mocked(readFileSync).mockReturnValue('{}');
            
            const removed = await dataStore.removeFromUserArray(
                'testfile', 
                'guild123', 
                'user456', 
                () => true
            );
            
            expect(removed).toBe(0);
        });
    });

    describe('generateId', () => {
        it('should generate unique IDs', () => {
            const id1 = dataStore.generateId();
            const id2 = dataStore.generateId();
            
            expect(id1).toBeTruthy();
            expect(id2).toBeTruthy();
            expect(id1).not.toBe(id2);
        });

        it('should generate IDs with timestamp prefix', () => {
            const before = Date.now();
            const id = dataStore.generateId();
            const after = Date.now();
            
            const timestamp = parseInt(id.split('-')[0]!);
            expect(timestamp).toBeGreaterThanOrEqual(before);
            expect(timestamp).toBeLessThanOrEqual(after);
        });

        it('should generate IDs with random suffix', () => {
            const id = dataStore.generateId();
            const parts = id.split('-');
            
            expect(parts.length).toBe(2);
            expect(parts[1]!.length).toBe(9);
        });
    });
});
