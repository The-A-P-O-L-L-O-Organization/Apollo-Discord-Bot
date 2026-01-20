// Data Store Utility
// Handles all JSON file-based data persistence

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Ensures the data directory exists
 */
function ensureDataDir() {
    if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
        console.log('[INFO] Created data directory');
    }
}

/**
 * Ensures a subdirectory exists within the data directory
 * @param {string} subdir - Subdirectory name
 */
export function ensureSubDir(subdir) {
    ensureDataDir();
    const subdirPath = path.join(DATA_DIR, subdir);
    if (!existsSync(subdirPath)) {
        mkdirSync(subdirPath, { recursive: true });
        console.log(`[INFO] Created data subdirectory: ${subdir}`);
    }
    return subdirPath;
}

/**
 * Gets the full path for a data file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @returns {string} Full path to the file
 */
function getFilePath(filename) {
    ensureDataDir();
    return path.join(DATA_DIR, `${filename}.json`);
}

/**
 * Reads data from a JSON file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @returns {Object} Parsed JSON data or empty object if file doesn't exist
 */
export function getData(filename) {
    const filePath = getFilePath(filename);
    
    try {
        if (existsSync(filePath)) {
            const data = readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error(`[ERROR] Failed to read ${filename}.json:`, error);
        return {};
    }
}

/**
 * Writes data to a JSON file
 * @param {string} filename - Name of the JSON file (without .json extension)
 * @param {Object} data - Data to write
 */
export function setData(filename, data) {
    const filePath = getFilePath(filename);
    
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`[ERROR] Failed to write ${filename}.json:`, error);
    }
}

/**
 * Gets data for a specific guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @returns {Object} Guild-specific data or empty object
 */
export function getGuildData(filename, guildId) {
    const data = getData(filename);
    return data[guildId] || {};
}

/**
 * Sets data for a specific guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {Object} guildData - Data to set for the guild
 */
export function setGuildData(filename, guildId, guildData) {
    const data = getData(filename);
    data[guildId] = guildData;
    setData(filename, data);
}

/**
 * Updates a specific key within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key to update
 * @param {*} value - Value to set
 */
export function updateGuildData(filename, guildId, key, value) {
    const data = getData(filename);
    if (!data[guildId]) {
        data[guildId] = {};
    }
    data[guildId][key] = value;
    setData(filename, data);
}

/**
 * Appends an item to an array within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key of the array
 * @param {*} item - Item to append
 */
export function appendToGuildArray(filename, guildId, key, item) {
    const data = getData(filename);
    if (!data[guildId]) {
        data[guildId] = {};
    }
    if (!Array.isArray(data[guildId][key])) {
        data[guildId][key] = [];
    }
    data[guildId][key].push(item);
    setData(filename, data);
}

/**
 * Removes items from an array within guild data based on a predicate
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} key - Key of the array
 * @param {Function} predicate - Function that returns true for items to remove
 * @returns {number} Number of items removed
 */
export function removeFromGuildArray(filename, guildId, key, predicate) {
    const data = getData(filename);
    if (!data[guildId] || !Array.isArray(data[guildId][key])) {
        return 0;
    }
    
    const originalLength = data[guildId][key].length;
    data[guildId][key] = data[guildId][key].filter(item => !predicate(item));
    const removed = originalLength - data[guildId][key].length;
    
    if (removed > 0) {
        setData(filename, data);
    }
    
    return removed;
}

/**
 * Gets user data within a guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {*} User data or undefined
 */
export function getUserData(filename, guildId, userId) {
    const guildData = getGuildData(filename, guildId);
    return guildData[userId];
}

/**
 * Sets user data within a guild
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {*} userData - Data to set
 */
export function setUserData(filename, guildId, userId, userData) {
    const data = getData(filename);
    if (!data[guildId]) {
        data[guildId] = {};
    }
    data[guildId][userId] = userData;
    setData(filename, data);
}

/**
 * Appends an item to a user's array within guild data
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {*} item - Item to append
 */
export function appendToUserArray(filename, guildId, userId, item) {
    const data = getData(filename);
    if (!data[guildId]) {
        data[guildId] = {};
    }
    if (!Array.isArray(data[guildId][userId])) {
        data[guildId][userId] = [];
    }
    data[guildId][userId].push(item);
    setData(filename, data);
}

/**
 * Removes items from a user's array based on a predicate
 * @param {string} filename - Name of the JSON file
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Function} predicate - Function that returns true for items to remove
 * @returns {number} Number of items removed
 */
export function removeFromUserArray(filename, guildId, userId, predicate) {
    const data = getData(filename);
    if (!data[guildId] || !Array.isArray(data[guildId][userId])) {
        return 0;
    }
    
    const originalLength = data[guildId][userId].length;
    data[guildId][userId] = data[guildId][userId].filter(item => !predicate(item));
    const removed = originalLength - data[guildId][userId].length;
    
    if (removed > 0) {
        setData(filename, data);
    }
    
    return removed;
}

/**
 * Generates a unique ID
 * @returns {string} Unique ID string
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Writes data to a specific file path (for transcripts, etc.)
 * @param {string} subdir - Subdirectory within data/
 * @param {string} filename - Full filename with extension
 * @param {Object} data - Data to write
 */
export function writeToSubDir(subdir, filename, data) {
    const subdirPath = ensureSubDir(subdir);
    const filePath = path.join(subdirPath, filename);
    
    try {
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[INFO] Wrote file: ${subdir}/${filename}`);
    } catch (error) {
        console.error(`[ERROR] Failed to write ${subdir}/${filename}:`, error);
    }
}
