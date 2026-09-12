// Data Store Utility
// Handles all JSON file-based data persistence

import { logger } from './logger.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

// Write queue to prevent race conditions during concurrent file operations
// Map<filename, Promise<void>> - tracks pending write operations per file
const writeQueue = new Map<string, Promise<void>>();

/**
 * Ensures the data directory exists
 */
function ensureDataDir(): void {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
        logger.info('[INFO] Created data directory');
    }
}

/**
 * Ensures a subdirectory exists within the data directory
 * @param {string} subdir - Subdirectory name
 */
export function ensureSubDir(subdir: string): string {
    ensureDataDir();
    const subdirPath = path.join(DATA_DIR, subdir);
    if (!existsSync(subdirPath)) {
        mkdirSync(subdirPath, { recursive: true });
        logger.info(`[INFO] Created data subdirectory: ${subdir}`);
    }
    return subdirPath;
}

/**
 * Gets the full path for a data file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @returns {string} Full path to the file
 */
function getFilePath(filename: string): string {
    ensureDataDir();
    return path.join(DATA_DIR, `${filename}.json`);
}

/**
 * Reads data from a JSON file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @returns {Record<string, unknown>} Parsed JSON data or empty object if file doesn't exist
 */
export function getData(filename: string): Record<string, unknown> {
    const filePath = getFilePath(filename);
    
    try {
        if (existsSync(filePath)) {
            const data = readFileSync(filePath, 'utf8');
            return JSON.parse(data) as Record<string, unknown>;
        }
        return {};
    } catch (error) {
        logger.error(`[ERROR] Failed to read ${filename}.json:`, error);
        return {};
    }
}

/**
 * Writes data to a JSON file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @param {Record<string, unknown>} data - Data to write
 */
export function setData(filename: string, data: Record<string, unknown>): void {
    const filePath = getFilePath(filename);
    
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        logger.error(`[ERROR] Failed to write ${filename}.json:`, error);
    }
}

/**
 * Gets data for a specific guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @returns {Record<string, unknown>} Guild-specific data or empty object
 */
export function getGuildData(filename: string, guildId: string): Record<string, unknown> {
    const data = getData(filename);
    return (data[guildId] as Record<string, unknown>) ?? {};
}

/**
 * Sets data for a specific guild with write queue to prevent race conditions
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {Record<string, unknown>} guildData - Data to set for the guild
 * @returns {Promise<void>}
 */
export async function setGuildData(filename: string, guildId: string, guildData: Record<string, unknown>): Promise<void> {
    // Wait for any pending write to complete before starting a new one
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    // Create a new write operation
    const writeOperation = (async () => {
        const data = getData(filename);
        data[guildId] = guildData;
        setData(filename, data);
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        // Clean up the queue entry if it's still our operation
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
}

/**
 * Updates a specific key within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key to update
 * @param {unknown} value - Value to set
 * @returns {Promise<void>}
 */
export async function updateGuildData(filename: string, guildId: string, key: string, value: unknown): Promise<void> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId]) {
            data[guildId] = {};
        }
        (data[guildId] as Record<string, unknown>)[key] = value;
        setData(filename, data);
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
}

/**
 * Appends an item to an array within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key of the array
 * @param {unknown} item - Item to append
 * @returns {Promise<void>}
 */
export async function appendToGuildArray(filename: string, guildId: string, key: string, item: unknown): Promise<void> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId]) {
            data[guildId] = {};
        }
        if (!Array.isArray((data[guildId] as Record<string, unknown>)[key])) {
            (data[guildId] as Record<string, unknown>)[key] = [];
        }
        ((data[guildId] as Record<string, unknown>)[key] as unknown[]).push(item);
        setData(filename, data);
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
}

/**
 * Removes items from an array within guild data based on a predicate
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key of the array
 * @param {Function} predicate - Function that returns true for items to remove
 * @returns {Promise<number>} Number of items removed
 */
export async function removeFromGuildArray(
    filename: string,
    guildId: string,
    key: string,
    predicate: (item: unknown) => boolean
): Promise<number> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    let removed = 0;
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId] || !Array.isArray((data[guildId] as Record<string, unknown>)[key])) {
            return 0;
        }
        
        const originalLength = ((data[guildId] as Record<string, unknown>)[key] as unknown[]).length;
        (data[guildId] as Record<string, unknown>)[key] = ((data[guildId] as Record<string, unknown>)[key] as unknown[]).filter(item => !predicate(item));
        removed = originalLength - ((data[guildId] as Record<string, unknown>)[key] as unknown[]).length;
        
        if (removed > 0) {
            setData(filename, data);
        }
        
        return removed;
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
    
    return removed;
}

/**
 * Gets user data within a guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {unknown} User data or undefined
 */
export function getUserData(filename: string, guildId: string, userId: string): unknown {
    const guildData = getGuildData(filename, guildId);
    return guildData[userId];
}

/**
 * Sets user data within a guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Record<string, unknown>} userData - Data to set
 * @returns {Promise<void>}
 */
export async function setUserData(
    filename: string,
    guildId: string,
    userId: string,
    userData: Record<string, unknown>
): Promise<void> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId]) {
            data[guildId] = {};
        }
        data[guildId][userId] = userData;
        setData(filename, data);
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
}

/**
 * Appends an item to a user's array within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {unknown} item - Item to append
 * @returns {Promise<void>}
 */
export async function appendToUserArray(
    filename: string,
    guildId: string,
    userId: string,
    item: unknown
): Promise<void> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId]) {
            data[guildId] = {};
        }
        if (!Array.isArray((data[guildId] as Record<string, unknown>)[userId])) {
            (data[guildId] as Record<string, unknown>)[userId] = [];
        }
        ((data[guildId] as Record<string, unknown>)[userId] as unknown[]).push(item);
        setData(filename, data);
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
}

/**
 * Removes items from a user's array based on a predicate
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Function} predicate - Function that returns true for items to remove
 * @returns {Promise<number>} Number of items removed
 */
export async function removeFromUserArray(
    filename: string,
    guildId: string,
    userId: string,
    predicate: (item: unknown) => boolean
): Promise<number> {
    const pendingWrite = writeQueue.get(filename);
    if (pendingWrite) {
        await pendingWrite;
    }
    
    let removed = 0;
    const writeOperation = (async () => {
        const data = getData(filename);
        if (!data[guildId] || !Array.isArray((data[guildId] as Record<string, unknown>)[userId])) {
            return 0;
        }
        
        const originalLength = ((data[guildId] as Record<string, unknown>)[userId] as unknown[]).length;
        (data[guildId] as Record<string, unknown>)[userId] = ((data[guildId] as Record<string, unknown>)[userId] as unknown[]).filter(item => !predicate(item));
        removed = originalLength - ((data[guildId] as Record<string, unknown>)[userId] as unknown[]).length;
        
        if (removed > 0) {
            setData(filename, data);
        }
        
        return removed;
    })();
    
    writeQueue.set(filename, writeOperation);
    
    try {
        await writeOperation;
    } finally {
        if (writeQueue.get(filename) === writeOperation) {
            writeQueue.delete(filename);
        }
    }
    
    return removed;
}

/**
 * Generates a unique ID
 * @returns {string} Unique ID string
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Writes data to a specific file path (for transcripts, etc.)
 * @param {string} subdir - Subdirectory within data/
 * @param {string} filename - Full filename with extension
 * @param {Record<string, unknown>} data - Data to write
 */
export function writeToSubDir(subdir: string, filename: string, data: Record<string, unknown>): void {
    const subdirPath = ensureSubDir(subdir);
    const filePath = path.join(subdirPath, filename);
    
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        logger.info(`[INFO] Wrote file: ${subdir}/${filename}`);
    } catch (error) {
        logger.error(`[ERROR] Failed to write ${subdir}/${filename}:`, error);
    }
}