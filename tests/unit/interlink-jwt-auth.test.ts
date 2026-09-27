import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';

// Mock config and fs at top level
vi.mock('../../src/config/config.js', () => ({
    config: {
        interlink: {
            jwtSecret: 'test-secret-key-min-32-chars-long!!',
            jwtExpiry: '1h',
            tlsCert: '',
            tlsKey: '',
            caCert: '',
            enabled: true,
            grpcAddress: 'http://localhost:50052',
            authKey: 'test-auth-key-min-32-chars-long!!',
            publicKey: '',
            rateLimit: { windowMs: 60000, maxRequests: 100 }
        },
        discord: {
            clientId: 'test-bot-123'
        }
    },
    default: {
        interlink: {
            jwtSecret: 'test-secret-key-min-32-chars-long!!',
            jwtExpiry: '1h',
            tlsCert: '',
            tlsKey: '',
            caCert: '',
            enabled: true,
            grpcAddress: 'http://localhost:50052',
            authKey: 'test-auth-key-min-32-chars-long!!',
            publicKey: '',
            rateLimit: { windowMs: 60000, maxRequests: 100 }
        },
        discord: {
            clientId: 'test-bot-123'
        }
    }
}));

vi.mock('node:fs', () => ({
    readFileSync: vi.fn()
}));

import { readFileSync } from 'node:fs';
import { issueInterlinkToken, verifyInterlinkToken, type InterlinkTokenPayload } from '../../src/plugins/interlink/auth.js';
import { loadCertificates, createTlsConfig } from '../../src/plugins/interlink/tls.js';

const testSecret = 'test-secret-key-min-32-chars-long!!';
const testBotId = 'test-bot-123';
const testCapabilities = { commands: 'true', events: 'true' };

describe('Interlink JWT Auth', () => {
    describe('issueInterlinkToken', () => {
        it('should issue a valid JWT token with correct payload', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT has 3 parts
        });

        it('should include required claims in payload', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);
            const { payload } = await jwtVerify(token, new TextEncoder().encode(testSecret));

            expect(payload.botId).toBe(testBotId);
            expect(payload.capabilities).toEqual(testCapabilities);
            expect(payload.iss).toBe('apollo-interlink');
            expect(payload.iat).toBeDefined();
            expect(payload.exp).toBeDefined();
            expect(payload.exp).toBeGreaterThan(payload.iat);
        });

        it('should use default 1h expiry when not specified', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);
            const { payload } = await jwtVerify(token, new TextEncoder().encode(testSecret));

            // 1 hour = 3600 seconds, allow small clock skew
            expect(payload.exp! - payload.iat!).toBeCloseTo(3600, -2);
        });

        it('should use HS256 algorithm', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);
            const parts = token.split('.');
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
            
            expect(header.alg).toBe('HS256');
            expect(header.typ).toBe('JWT');
        });
    });

    describe('verifyInterlinkToken', () => {
        it('should verify a valid token and return payload', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);
            const payload = await verifyInterlinkToken(token);

            expect(payload.botId).toBe(testBotId);
            expect(payload.capabilities).toEqual(testCapabilities);
            expect(payload.iss).toBe('apollo-interlink');
        });

        it('should reject token with invalid signature', async () => {
            const token = await issueInterlinkToken(testBotId, testCapabilities);
            // Tamper with the signature
            const parts = token.split('.');
            const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
            
            await expect(verifyInterlinkToken(tampered))
                .rejects.toThrow();
        });

        it('should reject token with wrong issuer', async () => {
            // Create token with different issuer using jose directly
            const wrongIssuerToken = await new SignJWT({ 
                botId: testBotId, 
                capabilities: testCapabilities,
                iss: 'wrong-issuer'
            })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(testSecret));
            
            await expect(verifyInterlinkToken(wrongIssuerToken))
                .rejects.toThrow();
        });

        it('should reject malformed token', async () => {
            await expect(verifyInterlinkToken('not.a.valid.token'))
                .rejects.toThrow();
        });

        it('should reject token missing required claims', async () => {
            const incompleteToken = await new SignJWT({ 
                botId: testBotId 
                // missing capabilities, iss
            })
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(testSecret));
            
            await expect(verifyInterlinkToken(incompleteToken))
                .rejects.toThrow();
        });
    });

    describe('Timing-safe verification', () => {
        it('should take constant time for valid and invalid tokens', async () => {
            const validToken = await issueInterlinkToken(testBotId, testCapabilities);
            const invalidToken = 'invalid.token.signature';
            
            // Time multiple verifications
            const iterations = 10;
            
            const validTimes: number[] = [];
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                try { await verifyInterlinkToken(validToken); } catch {}
                validTimes.push(performance.now() - start);
            }
            
            const invalidTimes: number[] = [];
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                try { await verifyInterlinkToken(invalidToken); } catch {}
                invalidTimes.push(performance.now() - start);
            }
            
            // Check that times are within reasonable range (not strictly constant time in JS
            // but should not have orders of magnitude difference)
            const avgValid = validTimes.reduce((a, b) => a + b, 0) / iterations;
            const avgInvalid = invalidTimes.reduce((a, b) => a + b, 0) / iterations;
            
            // Allow up to 10x difference (JS JIT may optimize valid path)
            expect(avgValid / avgInvalid).toBeLessThan(10);
            expect(avgInvalid / avgValid).toBeLessThan(10);
        });
    });
});

describe('Interlink mTLS', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadCertificates', () => {
        it('should return null when no TLS env vars set', () => {
            const certs = loadCertificates();
            expect(certs).toBeNull();
        });

        it('should load cert, key, and CA when all env vars set', async () => {
            vi.doMock('../../src/config/config.js', () => ({
                config: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/path/to/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '/path/to/ca.pem',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                },
                default: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/path/to/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '/path/to/ca.pem',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                }
            }));
            vi.resetModules();
            const { loadCertificates: load } = await import('../../src/plugins/interlink/tls.js');
            
            const mockCert = '-----BEGIN CERTIFICATE-----\ntest-cert\n-----END CERTIFICATE-----';
            const mockKey = '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----';
            const mockCa = '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----';
            
            vi.mocked(readFileSync)
                .mockReturnValueOnce(mockCert)
                .mockReturnValueOnce(mockKey)
                .mockReturnValueOnce(mockCa);
            
            const certs = load();
            
            expect(certs).toEqual({
                cert: mockCert,
                key: mockKey,
                ca: mockCa
            });
            expect(readFileSync).toHaveBeenCalledTimes(3);
        });

        it('should load only cert and key when CA not set', async () => {
            vi.doMock('../../src/config/config.js', () => ({
                config: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/path/to/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                },
                default: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/path/to/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                }
            }));
            vi.resetModules();
            const { loadCertificates: load } = await import('../../src/plugins/interlink/tls.js');
            
            const mockCert = 'cert-content';
            const mockKey = 'key-content';
            
            vi.mocked(readFileSync)
                .mockReturnValueOnce(mockCert)
                .mockReturnValueOnce(mockKey);
            
            const certs = load();
            
            expect(certs).toEqual({
                cert: mockCert,
                key: mockKey,
                ca: undefined
            });
            expect(readFileSync).toHaveBeenCalledTimes(2);
        });

        it('should throw when cert file cannot be read', async () => {
            vi.doMock('../../src/config/config.js', () => ({
                config: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/missing/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                },
                default: {
                    interlink: {
                        jwtSecret: 'test-secret-key-min-32-chars-long!!',
                        jwtExpiry: '1h',
                        tlsCert: '/missing/cert.pem',
                        tlsKey: '/path/to/key.pem',
                        caCert: '',
                        enabled: true,
                        grpcAddress: 'http://localhost:50052',
                        authKey: 'test-auth-key-min-32-chars-long!!',
                        publicKey: '',
                        rateLimit: { windowMs: 60000, maxRequests: 100 }
                    },
                    discord: { clientId: 'test-bot-123' }
                }
            }));
            vi.resetModules();
            const { loadCertificates: load } = await import('../../src/plugins/interlink/tls.js');
            
            vi.mocked(readFileSync).mockImplementationOnce(() => {
                throw new Error('ENOENT: no such file');
            });
            
            expect(() => load()).toThrow('Failed to load TLS certificate');
        });
    });

    describe('createTlsConfig', () => {
        it('should return undefined when no certificates loaded', () => {
            const config = createTlsConfig(null);
            expect(config).toBeUndefined();
        });

        it('should create TLS config with cert and key', () => {
            const certs = {
                cert: 'cert-content',
                key: 'key-content',
                ca: undefined
            };
            
            const config = createTlsConfig(certs);
            
            expect(config).toBeDefined();
            expect(config!.cert).toBe('cert-content');
            expect(config!.key).toBe('key-content');
            expect(config!.ca).toBeUndefined();
            expect(config!.requestCert).toBe(true);
            expect(config!.rejectUnauthorized).toBe(true);
        });

        it('should include CA when provided', () => {
            const certs = {
                cert: 'cert-content',
                key: 'key-content',
                ca: 'ca-content'
            };
            
            const config = createTlsConfig(certs);
            
            expect(config!.ca).toBe('ca-content');
        });
    });
});