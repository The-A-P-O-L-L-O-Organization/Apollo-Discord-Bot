import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertOperatorAgreement } from '../../src/utils/startupChecks.js';

describe('assertOperatorAgreement', () => {
    it('should throw when operator config is missing', () => {
        expect(() => assertOperatorAgreement(undefined)).toThrow(/Operator configuration is missing/);
        expect(() => assertOperatorAgreement(null)).toThrow(/Operator configuration is missing/);
    });

    it('should throw when operator config is not an object', () => {
        expect(() => assertOperatorAgreement('string')).toThrow(/Operator configuration is missing/);
        expect(() => assertOperatorAgreement(42)).toThrow(/Operator configuration is missing/);
    });

    it('should throw when agreed is not true', () => {
        expect(() => assertOperatorAgreement({ agreed: false, contact: 'x' })).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 'true', contact: 'x' })).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 'yes', contact: 'x' })).toThrow(/OPERATOR_AGREEMENT is not set to true/);
        expect(() => assertOperatorAgreement({ agreed: 1, contact: 'x' })).toThrow(/OPERATOR_AGREEMENT is not set to true/);
    });

    it('should throw when contact is empty', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: '' })).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true, contact: '   ' })).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true })).toThrow(/OPERATOR_CONTACT is empty/);
    });

    it('should throw when contact is not a string', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: 42 })).toThrow(/OPERATOR_CONTACT is empty/);
        expect(() => assertOperatorAgreement({ agreed: true, contact: null })).toThrow(/OPERATOR_CONTACT is empty/);
    });

    it('should not throw when agreed is true and contact is non-empty', () => {
        expect(() => assertOperatorAgreement({ agreed: true, contact: 'Discord: @op#0001' })).not.toThrow();
        expect(() => assertOperatorAgreement({ agreed: true, contact: 'email@example.com' })).not.toThrow();
    });

    it('should reference TOS.md and PRIVACY.md in the error message', () => {
        try {
            assertOperatorAgreement({ agreed: false, contact: 'x' });
        } catch (error) {
            expect(error.message).toContain('legal/TOS.md');
            expect(error.message).toContain('legal/PRIVACY.md');
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
        process.env.ALLOW_UNVERIFIED_PLUGINS = '1';
        process.env.NODE_ENV = 'production';
        
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
        process.env.ALLOW_UNVERIFIED_PLUGINS = '0';
        process.env.NODE_ENV = 'production';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when ALLOW_UNVERIFIED_PLUGINS=1 and NODE_ENV=development', async() => {
        process.env.ALLOW_UNVERIFIED_PLUGINS = '1';
        process.env.NODE_ENV = 'development';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when neither condition is met', async() => {
        process.env.ALLOW_UNVERIFIED_PLUGINS = '0';
        process.env.NODE_ENV = 'development';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when ALLOW_UNVERIFIED_PLUGINS is unset', async() => {
        delete process.env.ALLOW_UNVERIFIED_PLUGINS;
        process.env.NODE_ENV = 'production';
        
        const mockLogger = { warn: vi.fn() };
        vi.doMock('../../src/utils/logger.js', () => ({
            createLogger: () => mockLogger
        }));
        
        const { warnUnverifiedPlugins } = await import('../../src/utils/startupChecks.js');
        warnUnverifiedPlugins();
        
        expect(mockLogger.warn).not.toHaveBeenCalled();
    });
});