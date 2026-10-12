import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertHealthAuthToken, assertOperatorAgreement, validateSocketToken } from '../../src/utils/startupChecks.js';
import type { OperatorConfig } from '../../src/utils/startupChecks.js';

describe('assertHealthAuthToken', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env['HEALTH_AUTH_TOKEN'];
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should throw when HEALTH_AUTH_TOKEN is missing in production', () => {
        process.env['NODE_ENV'] = 'production';
        expect(() => assertHealthAuthToken()).toThrow(/HEALTH_AUTH_TOKEN is required in production/);
    });

    it('should not throw when HEALTH_AUTH_TOKEN is set in production', () => {
        process.env['NODE_ENV'] = 'production';
        process.env['HEALTH_AUTH_TOKEN'] = 'a'.repeat(64);
        expect(() => assertHealthAuthToken()).not.toThrow();
    });

    it('should not throw when HEALTH_AUTH_TOKEN is missing outside production', () => {
        process.env['NODE_ENV'] = 'development';
        expect(() => assertHealthAuthToken()).not.toThrow();
    });

    it('should not throw when NODE_ENV is unset', () => {
        delete process.env['NODE_ENV'];
        expect(() => assertHealthAuthToken()).not.toThrow();
    });
});

describe('assertOperatorAgreement', () => {
    it('should throw when operator config is missing', () => {
        expect(() => assertOperatorAgreement(undefined as unknown as OperatorConfig)).toThrow(/Operator configuration is missing/);
        expect(() => assertOperatorAgreement(null as unknown as OperatorConfig)).toThrow(/Operator configuration is missing/);
    });

    it('should throw when operator config is not an object', () => {
        expect(() => assertOperatorAgreement('string' as unknown as OperatorConfig)).toThrow(/Operator configuration is missing/);
        expect(() => assertOperatorAgreement(42 as unknown as OperatorConfig)).toThrow(/Operator configuration is missing/);
    });

    it('should throw when agreed is not true', () => {
        expect(() => assertOperatorAgreement({ agreed: false, contact: 'x' } as unknown as OperatorConfig)).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 'true', contact: 'x' } as unknown as OperatorConfig)).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 'yes', contact: 'x' } as unknown as OperatorConfig)).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 1, contact: 'x' } as unknown as OperatorConfig)).toThrow(/OPERATOR_AGREEMENT is not set to true/);
    });

    it('should throw when contact is empty', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: '' } as unknown as OperatorConfig)).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true, contact: '   ' } as unknown as OperatorConfig)).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true } as unknown as OperatorConfig)).toThrow(/OPERATOR_CONTACT is empty/);
    });

    it('should throw when contact is not a string', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: 42 } as unknown as OperatorConfig)).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true, contact: null } as unknown as OperatorConfig)).toThrow(/OPERATOR_CONTACT is empty/);
    });

    it('should not throw when agreed is true and contact is non-empty', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: 'Discord: @op#0001' } as unknown as OperatorConfig)).not.toThrow();
        expect(() => assertOperatorAgreement({ agreed: true, contact: 'email@example.com' } as unknown as OperatorConfig)).not.toThrow();
    });

    it('should reference TOS.md and PRIVACY.md in the error message', () => {
        try {
            assertOperatorAgreement({ agreed: false, contact: 'x' } as unknown as OperatorConfig);
        } catch (error) {
            const err = error as Error;
            expect(err.message).toContain('legal/TOS.md');
            expect(err.message).toContain('legal/PRIVACY.md');
        }
    });
});

describe('warnUnverifiedPlugins', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should warn when ALLOW_UNVERIFIED_PLUGINS=1 and NODE_ENV=production', async() => {
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '1';
        process.env['NODE_ENV'] = 'production';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[SECURITY] ALLOW_UNVERIFIED_PLUGINS is enabled in production!')
        );
    });

    it('should not warn when ALLOW_UNVERIFIED_PLUGINS=0 and NODE_ENV=production', async() => {
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '0';
        process.env['NODE_ENV'] = 'production';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when ALLOW_UNVERIFIED_PLUGINS=1 and NODE_ENV=development', async() => {
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '1';
        process.env['NODE_ENV'] = 'development';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when neither condition is met', async() => {
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '0';
        process.env['NODE_ENV'] = 'development';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when ALLOW_UNVERIFIED_PLUGINS is unset', async() => {
        delete process.env['ALLOW_UNVERIFIED_PLUGINS'];
        process.env['NODE_ENV'] = 'production';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
});

describe('warnMissingOtelEndpoint', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        delete process.env['OTEL_ENDPOINT'];
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should warn when OTEL_ENDPOINT is missing in production', async () => {
        process.env['NODE_ENV'] = 'production';

        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));

        const { warnMissingOtelEndpoint } = await import('../../src/utils/startupChecks.js');
        warnMissingOtelEndpoint();

        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[OBSERVABILITY] OTEL_ENDPOINT is not set in production.')
        );
    });

    it('should not warn when OTEL_ENDPOINT is set in production', async () => {
        process.env['NODE_ENV'] = 'production';
        process.env['OTEL_ENDPOINT'] = 'http://otel-collector:4318/v1/traces';

        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));

        const { warnMissingOtelEndpoint } = await import('../../src/utils/startupChecks.js');
        warnMissingOtelEndpoint();

        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when OTEL_ENDPOINT is missing outside production', async () => {
        process.env['NODE_ENV'] = 'development';

        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));

        const { warnMissingOtelEndpoint } = await import('../../src/utils/startupChecks.js');
        warnMissingOtelEndpoint();

        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when NODE_ENV is unset', async () => {
        delete process.env['NODE_ENV'];

        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));

        const { warnMissingOtelEndpoint } = await import('../../src/utils/startupChecks.js');
        warnMissingOtelEndpoint();

        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
});

describe('validateSocketToken', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env['APOLLO_SOCKET_TOKEN'];
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should throw when APOLLO_SOCKET_TOKEN is missing in production', () => {
        process.env['NODE_ENV'] = 'production';
        expect(() => validateSocketToken()).toThrow(/APOLLO_SOCKET_TOKEN is required in production/);
    });

    it('should not throw when APOLLO_SOCKET_TOKEN is set in production', () => {
        process.env['NODE_ENV'] = 'production';
        process.env['APOLLO_SOCKET_TOKEN'] = 'a'.repeat(64);
        expect(() => validateSocketToken()).not.toThrow();
    });

    it('should not throw when APOLLO_SOCKET_TOKEN is missing outside production', () => {
        process.env['NODE_ENV'] = 'development';
        expect(() => validateSocketToken()).not.toThrow();
    });
});