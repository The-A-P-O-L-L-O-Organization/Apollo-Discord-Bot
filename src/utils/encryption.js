// Encryption Utility
// AES-GCM encryption for sensitive data at rest
import { logger } from '../utils/logger.js';

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits
const CURRENT_VERSION = 1;

// PBKDF2 iterations - configurable via env, default 600000 (OWASP 2024 recommendation)
const PBKDF2_ITERATIONS = parseInt(process.env.PBKDF2_ITERATIONS || '600000', 10);

// LRU cache for decryption keys (salt -> derivedKey)
const _keyCache = new Map();
const MAX_KEY_CACHE_SIZE = 100;

/**
 * Parses encryption keys from environment
 * Supports comma-separated keys: ENCRYPTION_KEY=key1,key2,key3 (key1=current, others=legacy for decryption)
 * @returns {string[]} Array of base64-encoded keys
 */
function getEncryptionKeys() {
    const keysEnv = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEYS || '';
    if (!keysEnv) {
        return [];
    }
    return keysEnv.split(',').map(k => k.trim()).filter(Boolean);
}

/**
 * Gets derived key for a specific salt using the current encryption key
 * @param {Buffer} salt - Salt buffer
 * @returns {Buffer} Derived key
 */
function getDerivedKeyForSalt(salt) {
    const saltB64 = salt.toString('base64');
    if (_keyCache.has(saltB64)) {
        // Move to end (most recently used)
        const key = _keyCache.get(saltB64);
        _keyCache.delete(saltB64);
        _keyCache.set(saltB64, key);
        return key;
    }
    
    const keys = getEncryptionKeys();
    if (keys.length === 0) {
        throw new Error('ENCRYPTION_KEY environment variable is required for encryption at rest');
    }
    
    // Use the first (current) key for encryption
    const currentKey = keys[0];
    const derived = crypto.pbkdf2Sync(currentKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    
    // Evict oldest if cache full
    if (_keyCache.size >= MAX_KEY_CACHE_SIZE) {
        const firstKey = _keyCache.keys().next().value;
        _keyCache.delete(firstKey);
    }
    
    _keyCache.set(saltB64, derived);
    return derived;
}

/**
 * Tries to derive key using any available encryption key (for decryption with key rotation)
 * @param {Buffer} salt - Salt buffer
 * @returns {Buffer|null} Derived key or null if no key works
 */
function getDerivedKeyForSaltAny(salt) {
    const saltB64 = salt.toString('base64');
    if (_keyCache.has(saltB64)) {
        // Move to end (most recently used)
        const key = _keyCache.get(saltB64);
        _keyCache.delete(saltB64);
        _keyCache.set(saltB64, key);
        return key;
    }
    
    const keys = getEncryptionKeys();
    if (keys.length === 0) {
        return null;
    }
    
    // Try each key in order (current first, then legacy)
    for (const keyEnv of keys) {
        try {
            const derived = crypto.pbkdf2Sync(keyEnv, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
            
            if (_keyCache.size >= MAX_KEY_CACHE_SIZE) {
                const firstKey = _keyCache.keys().next().value;
                _keyCache.delete(firstKey);
            }
            
            _keyCache.set(saltB64, derived);
            return derived;
        } catch {
            // Try next key
        }
    }
    
    return null;
}

/**
 * Clears the cached encryption key (for testing)
 */
export function clearEncryptionKeyCache() {
    _keyCache.clear();
}

/**
 * Encrypts data using AES-256-GCM with version header
 * @param {string|Object} data - Data to encrypt (string or JSON-serializable object)
 * @returns {string} Base64 encoded encrypted data (version:salt:iv:authTag:ciphertext)
 */
export function encrypt(data) {
    // Generate fresh salt for each encryption (critical for AES-GCM security)
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key for this specific salt (cached)
    const derivedKey = getDerivedKeyForSalt(salt);
    
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Format: version:salt:iv:authTag:ciphertext (all base64)
    return [
        CURRENT_VERSION.toString(),
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64')
    ].join(':');
}

/**
 * Decrypts data using AES-256-GCM (supports v0 legacy format and v1+ versioned format)
 * @param {string} encryptedData - Base64 encoded encrypted data
 * @returns {string|Object|Array} Decrypted plaintext (parsed if JSON)
 */
export function decrypt(encryptedData) {
    const parts = encryptedData.split(':');
    
    // Legacy format (v0): salt:iv:authTag:ciphertext (4 parts)
    // Versioned format (v1+): version:salt:iv:authTag:ciphertext (5+ parts)
    let saltB64, ivB64, authTagB64, ciphertextB64;
    
    if (parts.length === 4) {
        // Legacy v0 format (no version prefix)
        [saltB64, ivB64, authTagB64, ciphertextB64] = parts;
    } else if (parts.length >= 5) {
        // Versioned format
        const version = parseInt(parts[0], 10);
        if (isNaN(version)) {
            throw new Error('Invalid encrypted data format');
        }
        [, saltB64, ivB64, authTagB64, ciphertextB64] = parts;
    } else {
        throw new Error('Invalid encrypted data format');
    }
    
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    
    // Derive key with stored salt (tries all available keys for rotation support)
    const derivedKey = getDerivedKeyForSaltAny(salt);
    if (!derivedKey) {
        throw new Error('No valid encryption key available for decryption');
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const result = plaintext.toString('utf8');
    
    // Try to parse as JSON (for arrays/objects that were stringified before encryption)
    try {
        return JSON.parse(result);
    } catch {
        return result;
    }
}

/**
 * Checks if a string appears to be encrypted (has the expected format)
 * @param {string} value - Value to check
 * @returns {boolean} True if value appears encrypted
 */
export function isEncrypted(value) {
    if (typeof value !== 'string') {return false;}
    const parts = value.split(':');
    // Support both legacy (4 parts) and versioned (5+ parts) formats
    if (parts.length === 4) {
        return parts.every(p => p.length > 0);
    }
    if (parts.length >= 5) {
        const version = parseInt(parts[0], 10);
        return !isNaN(version) && parts.slice(1).every(p => p.length > 0);
    }
    return false;
}

/**
 * Encrypts an object field selectively
 * @param {Object|Array|*} obj - Object to encrypt (only processes if plain object)
 * @param {string[]} fields - Field names to encrypt
 * @returns {Object|Array|*} Object with encrypted fields, or original value if not a plain object
 */
export function encryptFields(obj, fields) {
    // Only process plain objects (not arrays, null, or primitives)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    
    const result = { ...obj };
    for (const field of fields) {
        if (result[field] !== undefined && result[field] !== null) {
            result[field] = encrypt(result[field]);
        }
    }
    return result;
}

/**
 * Decrypts object fields selectively
 * @param {Object|Array|*} obj - Object with encrypted fields (only processes if plain object)
 * @param {string[]} fields - Field names to decrypt
 * @returns {Object|Array|*} Object with decrypted fields, or original value if not a plain object
 */
export function decryptFields(obj, fields) {
    // Only process plain objects (not arrays, null, or primitives)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }
    
    const result = { ...obj };
    for (const field of fields) {
        if (result[field] !== undefined && result[field] !== null) {
            try {
                result[field] = decrypt(result[field]);
            } catch (err) {
                // If decryption fails, leave as-is (might be unencrypted legacy data)
                logger.warn(`[ENCRYPTION] Failed to decrypt field ${field}: ${err.message}`);
            }
        }
    }
    return result;
}

/**
 * Gets the current encryption key version
 * @returns {number} Current version number
 */
export function getCurrentVersion() {
    return CURRENT_VERSION;
}

/**
 * Checks if encrypted data needs re-encryption (older version than current)
 * @param {string} encryptedData - Encrypted data string
 * @returns {boolean} True if re-encryption recommended
 */
export function needsReEncryption(encryptedData) {
    if (!isEncrypted(encryptedData)) {return false;}
    const parts = encryptedData.split(':');
    if (parts.length === 4) {return true;} // Legacy v0 format
    const version = parseInt(parts[0], 10);
    return version < CURRENT_VERSION;
}

/**
 * Re-encrypts data with current key if needed
 * @param {string} encryptedData - Currently encrypted data
 * @returns {string} Re-encrypted data with current version, or original if already current
 */
export function reEncryptIfNeeded(encryptedData) {
    if (!needsReEncryption(encryptedData)) {
        return encryptedData;
    }
    // Decrypt with any available key, then re-encrypt with current key
    const plaintext = decrypt(encryptedData);
    return encrypt(plaintext);
}

export default {
    encrypt,
    decrypt,
    encryptFields,
    decryptFields,
    isEncrypted,
    clearEncryptionKeyCache,
    getCurrentVersion,
    needsReEncryption,
    reEncryptIfNeeded
};