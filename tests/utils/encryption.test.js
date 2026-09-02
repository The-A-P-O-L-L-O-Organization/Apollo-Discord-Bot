import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
    encrypt,
    decrypt,
    encryptFields,
    decryptFields,
    isEncrypted,
    clearEncryptionKeyCache
} from '../../src/utils/encryption.js';

describe('Encryption', () => {
    beforeEach(() => {
        vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-32-chars-long!!');
        vi.stubEnv('ENCRYPTION_SALT', 'dGVzdC1zYWx0LTEyMzQ1Njc4OQ=='); // base64 encoded
        clearEncryptionKeyCache();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        clearEncryptionKeyCache();
    });

    it('should encrypt and decrypt strings', async() => {
        const plaintext = 'Hello, World!';
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        
        expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt objects', async() => {
        const plaintext = { foo: 'bar', num: 42, arr: [1, 2, 3] };
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        
        expect(decrypted).toEqual(plaintext);
    });

    it('should encrypt and decrypt arrays', async() => {
        const plaintext = ['a', 'b', 'c', { nested: 'object' }];
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        
        expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertext for same plaintext (unique salt)', async() => {
        const plaintext = 'Same message';
        const encrypted1 = await encrypt(plaintext);
        const encrypted2 = await encrypt(plaintext);
        
        // Should be different due to unique salt per encryption
        expect(encrypted1).not.toBe(encrypted2);
        
        // But both should decrypt to same plaintext
        expect(await decrypt(encrypted1)).toBe(plaintext);
        expect(await decrypt(encrypted2)).toBe(plaintext);
    });

    it('should produce valid encrypted format (version:salt:iv:authTag:ciphertext)', async() => {
        const plaintext = 'Test';
        const encrypted = await encrypt(plaintext);
        const parts = encrypted.split(':');
        
        expect(parts).toHaveLength(5);
        expect(parts[0]).toBe('1'); // version
        expect(parts[1]).toBeTruthy(); // salt
        expect(parts[2]).toBeTruthy(); // iv
        expect(parts[3]).toBeTruthy(); // authTag
        expect(parts[4]).toBeTruthy(); // ciphertext
        
        // All parts should be valid base64
        parts.slice(1).forEach(part => {
            expect(() => Buffer.from(part, 'base64')).not.toThrow();
        });
    });

    it('should decrypt with cached derived key', async() => {
        const plaintext = 'Cache test';
        const encrypted = await encrypt(plaintext);
        
        // First decrypt (populates cache)
        const decrypted1 = await decrypt(encrypted);
        expect(decrypted1).toBe(plaintext);
        
        // Second decrypt (uses cache)
        const decrypted2 = await decrypt(encrypted);
        expect(decrypted2).toBe(plaintext);
    });

    it('should encrypt and decrypt object fields selectively', async() => {
        const obj = {
            public: 'visible',
            secret: 'hidden',
            api_key: 'key123',
            normal: 'data'
        };
        
        const encrypted = await encryptFields(obj, ['secret', 'api_key']);
        
        expect(encrypted.public).toBe('visible');
        expect(encrypted.normal).toBe('data');
        expect(encrypted.secret).not.toBe('hidden');
        expect(encrypted.api_key).not.toBe('key123');
        expect(isEncrypted(encrypted.secret)).toBe(true);
        expect(isEncrypted(encrypted.api_key)).toBe(true);
    });

    it('should decrypt object fields selectively', async() => {
        const obj = {
            public: 'visible',
            secret: 'hidden',
            api_key: 'key123'
        };
        
        const encrypted = await encryptFields(obj, ['secret', 'api_key']);
        const decrypted = await decryptFields(encrypted, ['secret', 'api_key']);
        
        expect(decrypted.public).toBe('visible');
        expect(decrypted.secret).toBe('hidden');
        expect(decrypted.api_key).toBe('key123');
    });

    it('should handle non-object values in encryptFields', async() => {
        expect(await encryptFields(null, ['field'])).toBeNull();
        expect(await encryptFields('string', ['field'])).toBe('string');
        expect(await encryptFields(123, ['field'])).toBe(123);
        expect(await encryptFields([1, 2, 3], ['field'])).toEqual([1, 2, 3]);
    });

    it('should handle non-object values in decryptFields', async() => {
        expect(await decryptFields(null, ['field'])).toBeNull();
        expect(await decryptFields('string', ['field'])).toBe('string');
        expect(await decryptFields(123, ['field'])).toBe(123);
        expect(await decryptFields([1, 2, 3], ['field'])).toEqual([1, 2, 3]);
    });

    it('should identify encrypted values', async() => {
        const encrypted = await encrypt('test');
        expect(isEncrypted(encrypted)).toBe(true);
        
        expect(isEncrypted('not-encrypted')).toBe(false);
        expect(isEncrypted('')).toBe(false);
        expect(isEncrypted(null)).toBe(false);
        expect(isEncrypted(123)).toBe(false);
    });

    it('should clear cache', async() => {
        await encrypt('test');
        clearEncryptionKeyCache();
        
        // Should not throw and should work after clear
        const encrypted = await encrypt('test2');
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe('test2');
    });

    it('should throw on invalid encrypted format', async() => {
        await expect(decrypt('invalid')).rejects.toThrow('Invalid encrypted data format');
        await expect(decrypt('a:b:c')).rejects.toThrow('Invalid encrypted data format');
        await expect(decrypt('not-a-number:a:b:c:d')).rejects.toThrow('Invalid encrypted data format');
    });

    it('should throw on missing ENCRYPTION_KEY', async() => {
        vi.unstubAllEnvs();
        clearEncryptionKeyCache();
        
        await expect(encrypt('test')).rejects.toThrow('ENCRYPTION_KEY environment variable is required');
    });

    it('should handle decryption errors gracefully in decryptFields', async() => {
        const obj = {
            field: 'not-actually-encrypted'
        };
        
        // Should not throw, should leave value as-is
        const result = await decryptFields(obj, ['field']);
        expect(result.field).toBe('not-actually-encrypted');
    });
});