# Embed Markdown File Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `file` attachment option to `/embed` that parses a `.md` file into structured embed fields.

**Architecture:** A single new file `src/utils/markdownParser.js` handles markdown→embed parsing. The existing `embed.js` command file gets the new option added and invokes the parser when an attachment is present. Existing options take precedence over parsed content.

**Tech Stack:** Node.js built-ins (no new deps), Discord.js EmbedBuilder, `fetch()` for reading attachment URLs.

---

### Task 1: Write markdown parser utility

**Files:**
- Create: `src/utils/markdownParser.js`
- Test: `tests/utils/markdownParser.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/utils/markdownParser.test.js
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
        expect(result.fields[0].value.endsWith('…')).toBe(true);
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
        expect(result.footer?.text).toContain('guide.md');
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
        expect(result.title.endsWith('…')).toBe(true);
    });

    it('truncates description to 4096 chars', () => {
        const longDesc = 'B'.repeat(5000);
        const result = parseMarkdownToEmbed(longDesc, 'test.md');
        expect(result.description.length).toBe(4096);
        expect(result.description.endsWith('…')).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/utils/markdownParser.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/markdownParser.js
export function parseMarkdownToEmbed(content, filename, existing = {}) {
    if (!content || !content.trim()) return {};

    const lines = content.split('\n');
    const result = {};
    let currentField = null;
    let preamble = [];
    let inPreamble = true;
    let firstHeadingFound = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h1Match = line.match(/^# (.+)/);
        const h2Match = line.match(/^#{2,3} (.+)/);

        if (h1Match && !firstHeadingFound) {
            firstHeadingFound = true;
            inPreamble = false;
            if (!existing.title) {
                result.title = truncate(h1Match[1].trim(), 256);
            }
            continue;
        }

        if (h2Match && firstHeadingFound) {
            inPreamble = false;
            if (!result.fields) result.fields = [];
            if (result.fields.length >= 25) continue;
            currentField = { name: h2Match[1].trim(), value: '' };
            result.fields.push(currentField);
            continue;
        }

        if (inPreamble && firstHeadingFound && !h1Match && !h2Match) {
            inPreamble = false;
        }

        if (inPreamble) {
            preamble.push(line);
        } else if (currentField) {
            const trimmed = line.trim();
            if (trimmed) {
                currentField.value += (currentField.value ? '\n' : '') + line;
            }
        }
    }

    if (preamble.length > 0 && !existing.description) {
        result.description = truncate(preamble.join('\n').trim(), 4096);
    }

    if (result.fields) {
        for (const field of result.fields) {
            field.value = truncate(field.value.trim(), 1024);
        }
    }

    result.footer = { text: `Rendered from ${filename}` };

    return result;
}

function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/utils/markdownParser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -f docs/superpowers/plans/2026-05-15-embed-markdown-file.md
git add src/utils/markdownParser.js tests/utils/markdownParser.test.js
git commit -m "feat(embed): add markdown parser utility for .md file rendering"
```

### Task 2: Update embed command with file option

**Files:**
- Modify: `src/plugins/utility/commands/embed.js`
- Modify: `tests/commands/embed.test.js`

- [ ] **Step 1: Write failing test cases** (add to existing file)

Add these test cases inside the existing `Embed Command` describe block, after line 251:

```javascript
describe('execute - Markdown File', () => {
    beforeEach(() => {
        mockInteraction.options.getString.mockReturnValue(null);
        mockInteraction.options.getBoolean.mockReturnValue(null);
        mockInteraction.options.getAttachment = vi.fn().mockReturnValue(null);
    });

    it('should reject non-.md file attachments', async () => {
        mockInteraction.options.getAttachment.mockReturnValue({
            name: 'readme.txt',
            url: 'https://cdn.discord.com/readme.txt'
        });
        mockInteraction.options.getString.mockImplementation(name => {
            if (name === 'title') return 'Fallback Title';
            return null;
        });

        await embedCommand.execute(mockInteraction);

        expect(mockChannel.send).not.toHaveBeenCalled();
        const replyCall = mockInteraction.reply.mock.calls[0][0];
        expect(replyCall.content).toContain('.md');
        expect(replyCall.ephemeral).toBe(true);
    });

    it('should fetch and parse .md attachment', async () => {
        const attachment = {
            name: 'guide.md',
            url: 'https://cdn.discord.com/guide.md'
        };
        mockInteraction.options.getAttachment.mockReturnValue(attachment);
        mockInteraction.options.getString.mockImplementation(name => {
            if (name === 'title') return 'Manual Title';
            return null;
        });
        global.fetch = vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue('# Hello\n\n## Section 1\n\nContent here')
        });

        await embedCommand.execute(mockInteraction);

        expect(global.fetch).toHaveBeenCalledWith(attachment.url);
        expect(mockChannel.send).toHaveBeenCalled();
        const sendCall = mockChannel.send.mock.calls[0][0];
        // Manual title takes precedence over parsed # heading
        expect(sendCall.embeds[0].data.title).toBe('Manual Title');
        expect(sendCall.embeds[0].data.fields[0].name).toBe('Section 1');
        expect(sendCall.embeds[0].data.fields[0].value).toBe('Content here');
    });

    it('should handle empty .md file', async () => {
        mockInteraction.options.getAttachment.mockReturnValue({
            name: 'empty.md',
            url: 'https://cdn.discord.com/empty.md'
        });
        mockInteraction.options.getString.mockImplementation(name => {
            if (name === 'title') return 'Fallback';
            return null;
        });
        global.fetch = vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue('')
        });

        await embedCommand.execute(mockInteraction);

        const replyCall = mockInteraction.reply.mock.calls[0][0];
        expect(replyCall.content).toContain('empty');
        expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
        mockInteraction.options.getAttachment.mockReturnValue({
            name: 'broken.md',
            url: 'https://cdn.discord.com/broken.md'
        });
        mockInteraction.options.getString.mockImplementation(name => {
            if (name === 'title') return 'Fallback';
            return null;
        });
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        await embedCommand.execute(mockInteraction);

        const replyCall = mockInteraction.reply.mock.calls[0][0];
        expect(replyCall.content).toContain('Could not read');
        expect(mockChannel.send).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/commands/embed.test.js`
Expected: FAIL — current command doesn't handle attachments

- [ ] **Step 3: Update embed command**

Add the attachment option to the slash command definition:

```javascript
.addAttachmentOption(option =>
    option
        .setName('file')
        .setDescription('.md file to render as an embed')
        .setRequired(false)
)
```

Add the import and logic inside `execute()`, after the existing option reads and before the embed is built:

```javascript
import { parseMarkdownToEmbed } from '../../../utils/markdownParser.js';

// Then in execute(), after reading other options:
const file = interaction.options.getAttachment('file');
let parsed = {};
if (file) {
    if (!file.name.toLowerCase().endsWith('.md')) {
        return interaction.reply({
            content: 'Only `.md` files are supported. Please upload a markdown file.',
            ephemeral: true,
        });
    }
    try {
        const response = await fetch(file.url);
        const content = await response.text();
        if (!content.trim()) {
            return interaction.reply({
                content: 'The uploaded .md file is empty.',
                ephemeral: true,
            });
        }
        parsed = parseMarkdownToEmbed(content, file.name, { title, description });
    } catch {
        return interaction.reply({
            content: 'Could not read the attached file. Please try again.',
            ephemeral: true,
        });
    }
}
```

Then merge parsed content into the embed builder, after the manual options are set and before sending:

```javascript
if (parsed.title && !title) embed.setTitle(parsed.title);
if (parsed.description && !description) embed.setDescription(parsed.description);
if (parsed.fields) {
    for (const field of parsed.fields) {
        embed.addFields(field);
    }
}
if (parsed.footer) {
    embed.setFooter(parsed.footer);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/commands/embed.test.js tests/utils/markdownParser.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All passing

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All passing

- [ ] **Step 7: Commit**

```bash
git add src/plugins/utility/commands/embed.js tests/commands/embed.test.js
git commit -m "feat(embed): add .md file attachment option with markdown parsing"
```

### Task 3: Add embed command to utility CLI and socket handler

**Files:**
- Modify: `src/plugins/utility/cli/index.js`
- Modify: `src/plugins/utility/plugin.js`

- [ ] **Step 1: Add embed CLI command definition**

Add to the `commands` array in `src/plugins/utility/cli/index.js`, after the `ping` entry:

```javascript
        {
            name: 'embed',
            description: 'Send an embed message to a channel',
            needsSocket: true,
            options: [
                { name: 'channel', description: 'Channel ID to send to', required: true },
                { name: 'title', description: 'Embed title', required: false },
                { name: 'description', description: 'Embed description', required: false },
                { name: 'color', description: 'Hex color (e.g. #FF0000)', required: false },
                { name: 'image', description: 'Image URL', required: false },
                { name: 'thumbnail', description: 'Thumbnail URL', required: false },
                { name: 'footer', description: 'Footer text', required: false },
                { name: 'author', description: 'Author name', required: false },
                { name: 'url', description: 'Title link URL', required: false },
                { name: 'timestamp', description: 'Add timestamp (true/false)', required: false },
                { name: 'file', description: 'Path to .md file on disk', required: false }
            ]
        }
```

- [ ] **Step 2: Add CLI embed command test**

Add to `tests/cli/utility.test.js`:

```javascript
    it('has an embed command with file option', () => {
        const embed = utilityCommands.commands.find(c => c.name === 'embed');
        expect(embed).toBeDefined();
        expect(embed.needsSocket).toBe(true);
        expect(embed.options.find(o => o.name === 'file')).toBeDefined();
        expect(embed.options.find(o => o.name === 'channel')?.required).toBe(true);
    });
```

- [ ] **Step 3: Run CLI tests to verify**

Run: `pnpm test tests/cli/`
Expected: PASS

- [ ] **Step 4: Add socket handler for utility.embed**

In `src/plugins/utility/plugin.js`, inside `_registerSocketHandlers()`, add after the ping handler:

```javascript
    this.manager.registerSocketHandler('utility.embed', async (client, args) => {
        const { EmbedBuilder } = await import('discord.js');
        const { parseMarkdownToEmbed } = await import('../../../utils/markdownParser.js');

        const channel = client.channels.cache.get(args.channel);
        if (!channel) throw new Error(`Channel ${args.channel} not found`);
        if (!channel.isTextBased()) throw new Error(`Channel ${args.channel} is not a text channel`);

        const embed = new EmbedBuilder();

        let parsed = {};
        if (args.file) {
            const { readFileSync } = await import('fs');
            let content;
            try {
                content = readFileSync(args.file, 'utf-8');
            } catch {
                throw new Error(`Could not read file: ${args.file}`);
            }
            if (!content.trim()) throw new Error('The file is empty');
            parsed = parseMarkdownToEmbed(content, args.file, {
                title: args.title,
                description: args.description,
            });
        }

        if (parsed.title && !args.title) embed.setTitle(parsed.title);
        else if (args.title) embed.setTitle(args.title);

        if (parsed.description && !args.description) embed.setDescription(parsed.description);
        else if (args.description) embed.setDescription(args.description);

        if (args.color) {
            const hexRegex = /^#?([0-9A-Fa-f]{6})$/;
            const match = args.color.match(hexRegex);
            if (match) embed.setColor(`#${match[1]}`);
            else throw new Error('Invalid hex color format');
        } else {
            embed.setColor('#3498DB');
        }

        if (args.image) embed.setImage(args.image);
        if (args.thumbnail) embed.setThumbnail(args.thumbnail);
        if (args.footer) embed.setFooter({ text: args.footer });
        else if (parsed.footer) embed.setFooter(parsed.footer);
        if (args.author) embed.setAuthor({ name: args.author });
        if (args.url) embed.setURL(args.url);
        if (args.timestamp === 'true' || args.timestamp === true) embed.setTimestamp();

        if (parsed.fields) {
            for (const field of parsed.fields) {
                embed.addFields(field);
            }
        }

        try {
            await channel.send({ embeds: [embed] });
            return { success: true, message: 'Embed sent successfully' };
        } catch (err) {
            throw new Error(`Failed to send embed: ${err.message}`);
        }
    });
```

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add src/plugins/utility/cli/index.js src/plugins/utility/plugin.js
git commit -m "feat(cli): add utility embed command with .md file support"
```
