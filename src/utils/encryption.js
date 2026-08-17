// Encryption Utility
// AES-GCM encryption for sensitive data at rest

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000;

let _encryptionKey = null;

/**
 * Gets or derives the encryption key from environment variable
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
    if (_encryptionKey) {return _encryptionKey;}
    
    const keyEnv = process.env.ENCRYPTION_KEY;
    if (!keyEnv) {
        throw new Error('ENCRYPTION_KEY environment variable is required for encryption at rest');
    }
    
    // Derive key from passphrase using PBKDF2
    const salt = crypto.randomBytes(SALT_LENGTH);
    _encryptionKey = crypto.pbkdf2Sync(keyEnv, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    
    return _encryptionKey;
}

/**
 * Clears the cached encryption key (for testing)
 */
export function clearEncryptionKeyCache() {
    _encryptionKey = null;
}

/**
 * Encrypts data using AES-256-GCM
 * @param {string|Object} data - Data to encrypt (string or JSON-serializable object)
 * @returns {string} Base64 encoded encrypted data (salt:iv:authTag:ciphertext)
 */
export function encrypt(data) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Re-derive key with this salt for storage
    const derivedKey = crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Format: salt:iv:authTag:ciphertext (all base64)
    return [
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        ciphertext.toString('base64')
    ].join(':');
}

/**
 * Decrypts data using AES-256-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data (salt:iv:authTag:ciphertext)
 * @returns {string|Object|Array} Decrypted plaintext (parsed if JSON)
 */
export function decrypt(encryptedData) {
    const key = getEncryptionKey();
    
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted data format');
    }
    
    const [saltB64, ivB64, authTagB64, ciphertextB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    
    // Derive key with stored salt
    const derivedKey = crypto.pbkdf2Sync(process.env.ENCRYPTION_KEY, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    
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
                console.warn(`[ENCRYPTION] Failed to decrypt field ${field}: ${err.message}`);
            }
        }
    }
    return result;
}

/**
 * Checks if a string appears to be encrypted (has the expected format)
 * @param {string} value - Value to check
 * @returns {boolean} True if value appears encrypted
 */
export function isEncrypted(value) {
    if (typeof value !== 'string') {return false;}
    const parts = value.split(':');
    return parts.length === 4 && parts.every(p => p.length > 0);
}

export default {
    encrypt,
    decrypt,
    encryptFields,
    decryptFields,
    isEncrypted,
    clearEncryptionKeyCache
};