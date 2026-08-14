import { describe, it, expect } from 'vitest';
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
