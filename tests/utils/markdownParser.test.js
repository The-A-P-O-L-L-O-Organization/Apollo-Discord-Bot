import { describe, it, expect } from 'vitest';
import { parseMarkdownToEmbed } from '../../src/utils/markdownParser.js';

describe('parseMarkdownToEmbed', () => {
    it('uses first # heading as title', () => {
        const result = parseMarkdownToEmbed('# My Title\n\nSome content', 'test.md');
        expect(result.title).toBe('My Title');
    });

    it('does not override title when already provided', () => {
        const result = parseMarkdownToEmbed('# My Title\n\nContent', 'test.md', { title: 'Manual Title' });
        expect(result.title).toBe('Manual Title');
    });

    it('turns ## headings into field names', () => {
        const result = parseMarkdownToEmbed('## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2', 'test.md');
        expect(result.fields).toHaveLength(2);
        expect(result.fields[0].name).toBe('Section 1');
        expect(result.fields[0].value).toBe('Content 1');
        expect(result.fields[1].name).toBe('Section 2');
        expect(result.fields[1].value).toBe('Content 2');
    });

    it('uses text before first heading as description', () => {
        const result = parseMarkdownToEmbed('Preamble text\n\n## Section\n\nContent', 'test.md');
        expect(result.description).toBe('Preamble text');
    });

    it('does not override description when already provided', () => {
        const result = parseMarkdownToEmbed('Preamble\n\n# Title', 'test.md', { description: 'Manual desc' });
        expect(result.description).toBe('Manual desc');
    });

    it('truncates field values at 1024 chars', () => {
        const long = 'A'.repeat(1050);
        const result = parseMarkdownToEmbed(`## Section\n\n${long}`, 'test.md');
        expect(result.fields[0].value.length).toBe(1024);
        expect(result.fields[0].value.endsWith('\u2026')).toBe(true);
    });

    it('limits to 25 fields', () => {
        const lines = [];
        for (let i = 1; i <= 30; i++) {
            lines.push(`## Section ${i}\n\nContent ${i}`);
        }
        const result = parseMarkdownToEmbed(lines.join('\n\n'), 'test.md');
        expect(result.fields.length).toBe(25);
    });

    it('sets footer to rendered filename', () => {
        const result = parseMarkdownToEmbed('# Hello\n\nWorld', 'guide.md');
        expect(result.footer.text).toContain('guide.md');
    });

    it('handles empty content gracefully', () => {
        const result = parseMarkdownToEmbed('', 'empty.md');
        expect(result).toEqual({});
    });

    it('handles content with no headings', () => {
        const result = parseMarkdownToEmbed('Just a paragraph.\n\nAnother paragraph.', 'plain.md');
        expect(result.description).toBe('Just a paragraph.\n\nAnother paragraph.');
    });

    it('preserves code blocks, bold, italic in field values', () => {
        const md = '## Usage\n\nRun `npm start` with **care** and *focus*.';
        const result = parseMarkdownToEmbed(md, 'test.md');
        expect(result.fields[0].value).toContain('`npm start`');
        expect(result.fields[0].value).toContain('**care**');
        expect(result.fields[0].value).toContain('*focus*');
    });

    it('truncates title to 256 chars', () => {
        const longTitle = 'A'.repeat(300);
        const result = parseMarkdownToEmbed(`# ${longTitle}`, 'test.md');
        expect(result.title.length).toBe(256);
        expect(result.title.endsWith('\u2026')).toBe(true);
    });

    it('truncates description to 4096 chars', () => {
        const longDesc = 'B'.repeat(5000);
        const result = parseMarkdownToEmbed(longDesc, 'test.md');
        expect(result.description.length).toBe(4096);
        expect(result.description.endsWith('\u2026')).toBe(true);
    });

    it('handles ### headings as fields', () => {
        const result = parseMarkdownToEmbed('### Sub Section\n\nContent here', 'test.md');
        expect(result.fields[0].name).toBe('Sub Section');
    });
});
