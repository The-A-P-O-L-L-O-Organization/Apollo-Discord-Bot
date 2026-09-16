// Markdown to Embed Parser
// Parses markdown content into Discord embed format

interface ParsedField {
    name: string;
    value: string;
}

interface ParsedMarkdown {
    title?: string;
    description?: string;
    fields?: { name: string; value: string }[];
    footer?: { text: string };
}

interface ExistingEmbedData {
    title?: string;
    description?: string;
}

/**
 * Parses markdown content into Discord embed format
 * @param content - Markdown content to parse
 * @param filename - Source filename for footer
 * @param existing - Existing embed data to preserve
 * @returns Parsed embed data object
 */
export function parseMarkdownToEmbed(content: string, filename: string, existing: ExistingEmbedData = {}): ParsedMarkdown {
    if (!content?.trim()) {return {};}

    const lines = content.split('\n');
    let parsedTitle: string | undefined;
    let parsedDesc: string | undefined;
    const parsedFields: ParsedField[] = [];
    let currentField: ParsedField | null = null;
    const preamble: string[] = [];
    let inPreamble = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const h1Match = /^# (.+)/.exec(line);
        const h2Match = /^#{2,3} (.+)/.exec(line);

        if (h1Match && !parsedTitle) {
            parsedTitle = h1Match[1]?.trim();
            inPreamble = false;
            continue;
        }

        if (h2Match) {
            inPreamble = false;
            if (parsedFields.length >= 25) {continue;}
            currentField = { name: h2Match[1]?.trim() ?? '', value: '' };
            parsedFields.push(currentField);
            continue;
        }

        if (inPreamble) {
            preamble.push(line);
        } else if (currentField && line.trim()) {
            currentField.value += (currentField.value ? '\n' : '') + line;
        }
    }

    if (preamble.length > 0) {
        parsedDesc = preamble.join('\n').trim();
    }

    const result: ParsedMarkdown = {};
    if (existing.title) {result.title = existing.title;} else if (parsedTitle) {result.title = truncate(parsedTitle, 256);}

    if (existing.description) {result.description = existing.description;} else if (parsedDesc) {result.description = truncate(parsedDesc, 4096);}

    if (parsedFields.length > 0) {
        result.fields = parsedFields.map(f => ({
            name: truncate(f.name, 1024),
            value: truncate(f.value.trim(), 1024)
        }));
    }

    result.footer = { text: `Rendered from ${filename}` };

    return result;
}

function truncate(str: string, maxLen: number): string {
    if (!str || str.length <= maxLen) {return str;}
    return str.slice(0, maxLen - 1) + '\u2026';
}