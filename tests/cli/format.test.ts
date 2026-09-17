import { describe, it, expect } from 'vitest';
import { formatSuccess, formatError, formatInfo, formatTable, formatList } from '../../src/cli/format.js';

describe('formatSuccess', () => {
    it('wraps message in green [SUCCESS] prefix', () => {
        const result = formatSuccess('Word added');
        expect(result).toContain('[SUCCESS]');
        expect(result).toContain('Word added');
    });
});

describe('formatError', () => {
    it('wraps message in red [ERROR] prefix', () => {
        const result = formatError('Bot not running');
        expect(result).toContain('[ERROR]');
        expect(result).toContain('Bot not running');
    });
});

describe('formatInfo', () => {
    it('wraps message in yellow [INFO] prefix', () => {
        const result = formatInfo('No words banned');
        expect(result).toContain('[INFO]');
        expect(result).toContain('No words banned');
    });
});

describe('formatTable', () => {
    it('formats headers and rows as aligned table', () => {
        const headers = ['Name', 'Value'];
        const rows = [['Word', 'badword'], ['Count', '1']];
        const result = formatTable(headers, rows);
        expect(result).toContain('Name');
        expect(result).toContain('Word');
        expect(result).toContain('badword');
    });

    it('handles empty rows', () => {
        const result = formatTable(['Name'], []);
        expect(result).toContain('Name');
    });
});

describe('formatList', () => {
    it('formats items as bullet list', () => {
        const result = formatList(['word1', 'word2']);
        expect(result).toContain('• word1');
        expect(result).toContain('• word2');
    });

    it('handles empty list', () => {
        const result = formatList([]);
        expect(result).toBe('');
    });
});
