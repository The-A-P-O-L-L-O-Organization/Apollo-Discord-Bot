// Encryption Utility - TypeScript migration
// AES-GCM encryption for sensitive data at rest

import crypto from 'crypto';
import { promisify } from 'util';

// Lazy logger to avoid circular dependency
let _logger: any = null;
async function getLogger() {
    if (!_logger) {
        const mod = await import('./logger.js');
        _logger = mod.logger;
    }
    return _logger;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16; // 128 bits
const CURRENT_VERSION = 1;

// PBKDF2 iterations - configurable via env, default 600000 (OWASP 2024 recommendation)
const PBKDF2_ITERATIONS = parseInt(process.env['PBKDF2_ITERATIONS'] ?? '600000', 10);

// LRU cache for decryption keys (salt -> derivedKey)
const _keyCache = new Map<string, Buffer>();
const MAX_KEY_CACHE_SIZE = 100;

// Promisified PBKDF2 for async (non-blocking) key derivation
const pbkdf2Async = promisify(crypto.pbkdf2);

/**
 * Parses encryption keys from environment
 * Supports comma-separated keys: ENCRYPTION_KEY=key1,key2,key3 (key1=current, others=legacy for decryption)
 * @returns Array of base64-encoded keys
 */
function getEncryptionKeys(): string[] {
    const keysEnv = process.env['ENCRYPTION_KEY'] ?? process.env['ENCRYPTION_KEYS'] ?? '';
    if (!keysEnv) {
        return [];
    }
    return keysEnv.split(',').map(k => k.trim()).filter(Boolean);
}

/**
 * Gets derived key for a specific salt using the current encryption key (async, non-blocking)
 * @param salt - Salt buffer
 * @returns Derived key
 */
async function getDerivedKeyForSalt(salt: Buffer): Promise<Buffer> {
    const saltB64 = salt.toString('base64');
    if (_keyCache.has(saltB64)) {
        // Move to end (most recently used)
        const key = _keyCache.get(saltB64);
        if (!key) {throw new Error('Cache inconsistency: key missing');}
        _keyCache.delete(saltB64);
        _keyCache.set(saltB64, key);
        return key;
    }

    const keys = getEncryptionKeys();
    if (keys.length === 0) {
        throw new Error('ENCRYPTION_KEY environment variable is required for encryption at rest');
    }

    // Use the first (current) key for encryption
    const currentKey = keys[0]!;
    const derived = await pbkdf2Async(currentKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

    // Evict oldest if cache full
    if (_keyCache.size >= MAX_KEY_CACHE_SIZE) {
        const firstKey = _keyCache.keys().next().value;
        if (firstKey) {_keyCache.delete(firstKey);}
    }

    _keyCache.set(saltB64, derived);
    return derived;
}

/**
 * Tries to derive key using any available encryption key (for decryption with key rotation)
 * @param salt - Salt buffer
 * @returns Derived key or null if no key works
 */
async function getDerivedKeyForSaltAny(salt: Buffer): Promise<Buffer | null> {
    const saltB64 = salt.toString('base64');
    if (_keyCache.has(saltB64)) {
        // Move to end (most recently used)
        const key = _keyCache.get(saltB64);
        if (!key) {return null;}
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
            const derived = await pbkdf2Async(keyEnv, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

            if (_keyCache.size >= MAX_KEY_CACHE_SIZE) {
                const firstKey = _keyCache.keys().next().value;
                if (firstKey) {_keyCache.delete(firstKey);}
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
export function clearEncryptionKeyCache(): void {
    _keyCache.clear();
}

/**
 * Encrypts data using AES-256-GCM with version header (async, non-blocking)
 * @param data - Data to encrypt (string or JSON-serializable object)
 * @returns Base64 encoded encrypted data (version:salt:iv:authTag:ciphertext)
 */
export async function encrypt(data: string | object): Promise<string> {
    // Generate fresh salt for each encryption (critical for AES-GCM security)
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key for this specific salt (cached, async non-blocking)
    const derivedKey = await getDerivedKeyForSalt(salt);

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
 * @param encryptedData - Base64 encoded encrypted data
 * @returns Decrypted plaintext (parsed if JSON)
 */
export async function decrypt(encryptedData: string): Promise<string | object | unknown[]> {
    const parts = encryptedData.split(':');

    // Legacy format (v0): salt:iv:authTag:ciphertext (4 parts)
    // Versioned format (v1+): version:salt:iv:authTag:ciphertext (5+ parts)
    let saltB64 = '';
    let ivB64 = '';
    let authTagB64 = '';
    let ciphertextB64 = '';

    if (parts.length === 4) {
        // Legacy v0 format (no version prefix)
        [saltB64, ivB64, authTagB64, ciphertextB64] = [parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', parts[3] ?? ''];
    } else if (parts.length >= 5) {
        // Versioned format
        const version = parseInt(parts[0] ?? '', 10);
        if (isNaN(version)) {
            throw new Error('Invalid encrypted data format');
        }
        saltB64 = parts[1] ?? '';
        ivB64 = parts[2] ?? '';
        authTagB64 = parts[3] ?? '';
        ciphertextB64 = parts[4] ?? '';
    } else {
        throw new Error('Invalid encrypted data format');
    }

    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    // Derive key with stored salt (tries all available keys for rotation support, async)
    const derivedKey = await getDerivedKeyForSaltAny(salt);
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
 * @param value - Value to check
 * @returns True if value appears encrypted
 */
export function isEncrypted(value: string): boolean {
    if (typeof value !== 'string') { return false; }
    const parts = value.split(':');
    // Support both legacy (4 parts) and versioned (5+ parts) formats
    if (parts.length === 4) {
        return parts.every(p => p.length > 0);
    }
    if (parts.length >= 5) {
        const version = parseInt(parts[0] ?? '', 10);
        return !isNaN(version) && parts.slice(1).every(p => p.length > 0);
    }
    return false;
}

/**
 * Encrypts an object field selectively (async, non-blocking)
 * @param obj - Object to encrypt (only processes if plain object)
 * @param fields - Field names to encrypt
 * @returns Object with encrypted fields, or original value if not a plain object
 */
export async function encryptFields(obj: Record<string, unknown> | unknown[], fields: string[]): Promise<Record<string, unknown> | unknown[]> {
    // Only process plain objects (not arrays, null, or primitives)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }

    const result = { ...obj } as Record<string, unknown>;
    for (const field of fields) {
        if (result[field] !== undefined && result[field] !== null) {
            result[field] = await encrypt(result[field]);
        }
    }
    return result;
}

/**
 * Decrypts object fields selectively (async, non-blocking)
 * @param obj - Object with encrypted fields (only processes if plain object)
 * @param fields - Field names to decrypt
 * @returns Object with decrypted fields, or original value if not a plain object
 */
export async function decryptFields(obj: Record<string, unknown>, fields: string[]): Promise<Record<string, unknown>> {
    // Only process plain objects (not arrays, null, or primitives)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }

    const result = { ...obj };
    for (const field of fields) {
        if (result[field] !== undefined && result[field] !== null) {
            try {
                // Type assertion since we've checked it's not undefined/null
                result[field] = await decrypt(result[field] as string);
            } catch (err) {
                // If decryption fails, leave as-is (might be unencrypted legacy data)
                const log = await getLogger();
                log.warn(`[ENCRYPTION] Failed to decrypt field ${field}: ${(err as Error).message}`);
            }
        }
    }
    return result;
}

/**
 * Gets the current encryption key version
 * @returns Current version number
 */
export function getCurrentVersion(): number {
    return CURRENT_VERSION;
}

/**
 * Checks if encrypted data needs re-encryption (older version than current)
 * @param encryptedData - Encrypted data string
 * @returns True if re-encryption recommended
 */
export function needsReEncryption(encryptedData: string): boolean {
    if (!isEncrypted(encryptedData)) { return false; }
    const parts = encryptedData.split(':');
    if (parts.length === 4) { return true; } // Legacy v0 format
    const version = parseInt(parts[0] ?? '', 10);
    return version < CURRENT_VERSION;
}

/**
 * Re-encrypts data with current key if needed (async, non-blocking)
 * @param encryptedData - Currently encrypted data
 * @returns Re-encrypted data with current version, or original if already current
 */
export async function reEncryptIfNeeded(encryptedData: string): Promise<string> {
    if (!needsReEncryption(encryptedData)) {
        return encryptedData;
    }
    // Decrypt with any available key, then re-encrypt with current key
    const plaintext = await decrypt(encryptedData);
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