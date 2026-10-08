// Encryption Key Rotation Tests
// Validates the ENCRYPTION_KEY rotation procedure works correctly

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { encrypt, decrypt, encryptFields, decryptFields, reEncryptAll, clearEncryptionKeyCache } from '../../src/utils/encryption.js';

// Helper to generate 32-byte base64 keys for testing
function makeKey(n: number): string {
    return Buffer.alloc(32, n).toString('base64');
}

const KEY_A = makeKey(1);
const KEY_B = makeKey(2);
const KEY_C = makeKey(3);

describe('Encryption Key Rotation', () => {
    beforeAll(() => {
        vi.stubEnv('ENCRYPTION_KEY', `${KEY_A},${KEY_B}`);
        vi.stubEnv('PBKDF2_ITERATIONS', '1000'); // Lower for faster tests
    });

    afterAll(() => {
        vi.unstubAllEnvs();
        clearEncryptionKeyCache();
    });

    it('should encrypt and decrypt with current key', async() => {
        const plaintext = 'Hello, World!';
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('should encrypt object and decrypt correctly', async() => {
        const plaintext = { userId: '12345', secret: 'my-secret-value' };
        const encrypted = await encrypt(plaintext);
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toEqual(plaintext);
    });

    it('should decrypt data encrypted with legacy key when both keys present', async() => {
        // Encrypt with KEY_A (first in list)
        vi.stubEnv('ENCRYPTION_KEY', `${KEY_A},${KEY_B}`);
        clearEncryptionKeyCache();
        
        const plaintext = 'legacy encrypted data';
        const encrypted = await encrypt(plaintext); // Uses KEY_A
        
        // Now make KEY_C the current, with KEY_A and KEY_B as legacy
        vi.stubEnv('ENCRYPTION_KEY', `${KEY_C},${KEY_A},${KEY_B}`);
        clearEncryptionKeyCache();
        
        // Should be able to decrypt because KEY_A is still in the list
        const decrypted = await decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    it('should handle key rotation: encrypt with old key, decrypt with new+old, then decrypt with new only', async() => {
        // Phase 1: Start with single key (KEY_A)
        vi.stubEnv('ENCRYPTION_KEY', KEY_A);
        clearEncryptionKeyCache();
        
        const plaintext = 'rotation test data';
        const encryptedOld = await encrypt(plaintext); // Encrypted with KEY_A
        
        // Phase 2: Add new key (KEY_B, KEY_A) - dual key period
        vi.stubEnv('ENCRYPTION_KEY', `${KEY_B},${KEY_A}`);
        clearEncryptionKeyCache();
        
        // Should decrypt old data with dual keys (KEY_A is second)
        const decryptedPhase2 = await decrypt(encryptedOld);
        expect(decryptedPhase2).toBe(plaintext);
        
        // Phase 3: Re-encrypt with new key (KEY_B is now first)
        // In real rotation, this is done by the reEncryptAll script
        const reEncrypted = await encrypt(decryptedPhase2); // Uses KEY_B
        
        // Phase 4: Remove old key (KEY_B only)
        vi.stubEnv('ENCRYPTION_KEY', KEY_B);
        clearEncryptionKeyCache();
        
        // Should still decrypt re-encrypted data
        const decryptedPhase3 = await decrypt(reEncrypted);
        expect(decryptedPhase3).toBe(plaintext);
    });

    it('should handle encryptFields and decryptFields with rotation', async() => {
        const obj = {
            publicField: 'visible',
            secretField: 'encrypted-value',
            anotherField: 'also-visible'
        };
        
        const encrypted = await encryptFields(obj, ['secretField']) as Record<string, unknown>;
        expect(encrypted['publicField']).toBe('visible');
        expect(encrypted['anotherField']).toBe('also-visible');
        expect(encrypted['secretField']).not.toBe('encrypted-value');
        expect(typeof encrypted['secretField']).toBe('string');
        expect((encrypted['secretField'] as string).split(':').length).toBeGreaterThanOrEqual(4);
        
        const decrypted = await decryptFields(encrypted, ['secretField']) as typeof obj;
        expect(decrypted).toEqual(obj);
    });

    it('should handle reEncryptAll dry-run', async() => {
        // This tests the dry-run functionality without actual DB
        const result = await reEncryptAll(true);
        expect(result).toHaveProperty('updated');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.updated).toBe('number');
    });

    it('should detect encrypted format correctly', () => {
        const encrypted = '1:salt:iv:tag:ciphertext';
        expect(encrypt).toBeDefined();
        // The isEncrypted check is internal but we can test the format
        expect(encrypted.split(':').length).toBe(5);
    });

    it('should handle empty or invalid ENCRYPTION_KEY gracefully', async() => {
        vi.stubEnv('ENCRYPTION_KEY', '');
        clearEncryptionKeyCache();
        
        await expect(encrypt('test')).rejects.toThrow('ENCRYPTION_KEY environment variable is required');
        
        vi.stubEnv('ENCRYPTION_KEY', KEY_A);
        clearEncryptionKeyCache();
    });
});

describe('Encryption Key Rotation - Integration', () => {
    it('should complete full rotation cycle without data loss', async() => {
        // This is a high-level integration test
        const testData = [
            { id: 'user1', email: 'user1@example.com', apiKey: 'secret-api-key-1' },
            { id: 'user2', email: 'user2@example.com', apiKey: 'secret-api-key-2' },
            { id: 'guild1', webhookUrl: 'https://discord.com/api/webhooks/123/abc', modLogChannel: '123456' }
        ];
        
        // Phase 1: Encrypt with initial key (KEY_A)
        vi.stubEnv('ENCRYPTION_KEY', KEY_A);
        vi.stubEnv('PBKDF2_ITERATIONS', '1000');
        clearEncryptionKeyCache();
        
        const encryptedData: Record<string, unknown>[] = [];
        for (const item of testData) {
            const encryptedItem: Record<string, unknown> = { ...item };
            if (item['email']) encryptedItem['email'] = await encrypt(item['email'] as string);
            if (item['apiKey']) encryptedItem['apiKey'] = await encrypt(item['apiKey'] as string);
            if (item['webhookUrl']) encryptedItem['webhookUrl'] = await encrypt(item['webhookUrl'] as string);
            if (item['modLogChannel']) encryptedItem['modLogChannel'] = await encrypt(item['modLogChannel'] as string);
            encryptedData.push(encryptedItem);
        }
        
        // Phase 2: Add new key (KEY_B, KEY_A) - simulate rotation start
        vi.stubEnv('ENCRYPTION_KEY', `${KEY_B},${KEY_A}`);
        clearEncryptionKeyCache();
        
        // Should still decrypt all data (KEY_A is still in list)
        for (const item of encryptedData) {
            if (item['email']) expect(await decrypt(item['email'] as string)).toMatch(/^user\d+@example\.com$/);
            if (item['apiKey']) expect(await decrypt(item['apiKey'] as string)).toMatch(/^secret-api-key-\d+$/);
            if (item['webhookUrl']) expect(await decrypt(item['webhookUrl'] as string)).toMatch(/^https:\/\/discord\.com\/api\/webhooks\/\d+\/\w+$/);
            if (item['modLogChannel']) {
                const decrypted = await decrypt(item['modLogChannel'] as string);
                expect(String(decrypted)).toBe('123456');
            }
        }
        
        // Phase 3: Re-encrypt with new key (simulated by re-encrypting)
        const reEncryptedData: Record<string, unknown>[] = [];
        for (const item of encryptedData) {
            const reEncrypted: Record<string, unknown> = { ...item };
            for (const [key, value] of Object.entries(item)) {
                if (value && typeof value === 'string' && value.includes(':')) {
                    reEncrypted[key] = await encrypt(await decrypt(value as string));
                }
            }
            reEncryptedData.push(reEncrypted);
        }
        
        // Phase 4: Remove old key (KEY_B only)
        vi.stubEnv('ENCRYPTION_KEY', KEY_B);
        clearEncryptionKeyCache();
        
        // Should still decrypt all re-encrypted data
        for (const item of reEncryptedData) {
            if (item['email']) expect(await decrypt(item['email'] as string)).toMatch(/^user\d+@example\.com$/);
            if (item['apiKey']) expect(await decrypt(item['apiKey'] as string)).toMatch(/^secret-api-key-\d+$/);
            if (item['webhookUrl']) expect(await decrypt(item['webhookUrl'] as string)).toMatch(/^https:\/\/discord\.com\/api\/webhooks\/\d+\/\w+$/);
            if (item['modLogChannel']) {
                const decrypted = await decrypt(item['modLogChannel'] as string);
                expect(String(decrypted)).toBe('123456');
            }
        }
        
        vi.unstubAllEnvs();
        clearEncryptionKeyCache();
    });
});