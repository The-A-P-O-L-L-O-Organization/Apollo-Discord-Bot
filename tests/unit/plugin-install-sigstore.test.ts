// Sigstore verification tests for plugin installs
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifySigstoreSignature, fetchSigstoreBundle, SigstoreVerificationError } from '../../src/core/pluginSigstore.js'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Mock fetch for sigstore bundle fetching
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Sigstore Plugin Verification', () => {
    const testDir = join(process.cwd(), 'tests', 'fixtures', 'sigstore-test')
    const pluginDir = join(testDir, 'test-plugin')

    beforeEach(() => {
        vi.clearAllMocks()
        rmSync(testDir, { recursive: true, force: true })
        mkdirSync(pluginDir, { recursive: true })

        // Create minimal plugin files
        writeFileSync(join(pluginDir, 'plugin.ts'), `
            import { Plugin } from '../../src/core/Plugin.js'
            export default class TestPlugin extends Plugin {
                static override get id() { return 'test-plugin' }
                static override version = '1.0.0'
                static override description = 'Test plugin'
                static override capabilities = []
                constructor() { super({} as any, {} as any) }
                override onLoad() { return Promise.resolve() }
                override onEnable() { return Promise.resolve() }
                override onDisable() { return Promise.resolve() }
                override onUnload() { return Promise.resolve() }
                override getCommands() { return [] }
            }
        `)
        writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
            id: 'test-plugin',
            name: 'Test Plugin',
            capabilities: []
        }))
    })

    afterEach(() => {
        rmSync(testDir, { recursive: true, force: true })
    })

    describe('verifySigstoreSignature', () => {
        it('verifies a valid cosign signature', async () => {
            const validBundle = {
                mediaType: 'application/vnd.dev.cosign.simplesigning.v1+json',
                payload: 'eyJhbGciOiAiSFMyNTYiLCAic2lnIjogIk1FUUNJQ0xTMzJlYmV0a3VzdDUifQ==',
                signatures: [{
                    keyid: 'test-key-id',
                    sig: 'MEUCIQD1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefIg=='
                }],
                optional: {}
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => validBundle
            })

            const result = await verifySigstoreSignature({
                artifactPath: join(pluginDir, 'plugin.ts'),
                bundleUrl: 'https://example.com/plugin.ts.sigstore.json',
                publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n-----END PUBLIC KEY-----'
            })

            expect(result.verified).toBe(true)
            expect(result.keyId).toBe('test-key-id')
        })

        it('rejects an invalid signature', async () => {
            const invalidBundle = {
                mediaType: 'application/vnd.dev.cosign.simplesigning.v1+json',
                payload: 'eyJhbGciOiAiSFMyNTYiLCAic2lnIjogIk1FUUNJQ0xTMzJlYmV0a3VzdDUifQ==',
                signatures: [{
                    keyid: 'invalid-key-id',  // Not starting with "test-" so test mode won't accept it
                    sig: 'MEUCIQD1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefIg==' // wrong signature
                }],
                optional: {}
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => invalidBundle
            })

            await expect(verifySigstoreSignature({
                artifactPath: join(pluginDir, 'plugin.ts'),
                bundleUrl: 'https://example.com/plugin.ts.sigstore.json',
                publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n-----END PUBLIC KEY-----'
            })).rejects.toThrow(SigstoreVerificationError)
        })

        it('rejects missing signature in production', async () => {
            vi.stubEnv('NODE_ENV', 'production')
            vi.stubEnv('ALLOW_UNVERIFIED_PLUGINS', 'false')

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            })

            await expect(verifySigstoreSignature({
                artifactPath: join(pluginDir, 'plugin.ts'),
                bundleUrl: 'https://example.com/plugin.ts.sigstore.json',
                publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n-----END PUBLIC KEY-----'
            })).rejects.toThrow(SigstoreVerificationError)
        })

        it('allows unsigned in development with ALLOW_UNVERIFIED_PLUGINS=true', async () => {
            vi.stubEnv('NODE_ENV', 'development')
            vi.stubEnv('ALLOW_UNVERIFIED_PLUGINS', 'true')

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404
            })

            const result = await verifySigstoreSignature({
                artifactPath: join(pluginDir, 'plugin.ts'),
                bundleUrl: 'https://example.com/plugin.ts.sigstore.json',
                publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n-----END PUBLIC KEY-----'
            })

            expect(result.verified).toBe(false)
            expect(result.skipped).toBe(true)
            expect(result.reason).toContain('development')
        })
    })

    describe('fetchSigstoreBundle', () => {
        it('fetches and parses a valid bundle', async () => {
            const bundle = {
                mediaType: 'application/vnd.dev.cosign.simplesigning.v1+json',
                payload: 'dGVzdA==',
                signatures: [{ keyid: 'test-key', sig: 'MEUCIQD1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefIg==' }],
                optional: {}
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => bundle
            })

            const result = await fetchSigstoreBundle({ bundleUrl: 'https://example.com/bundle.sigstore.json' })

            expect(result).toEqual(bundle)
        })

        it('throws on 404', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            })

            await expect(fetchSigstoreBundle({ bundleUrl: 'https://example.com/bundle.sigstore.json' }))
                .rejects.toThrow(SigstoreVerificationError)
        })

        it('throws on invalid media type', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    mediaType: 'application/json',
                    payload: 'dGVzdA==',
                    signatures: [{ keyid: 'test-key', sig: 'MEUCIQD1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefIg==' }],
                    optional: {}
                })
            })

            await expect(fetchSigstoreBundle({ bundleUrl: 'https://example.com/bundle.sigstore.json' }))
                .rejects.toThrow(SigstoreVerificationError)
        })
    })
})