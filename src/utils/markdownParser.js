export function parseMarkdownToEmbed(content, filename, existing = {}) {
    if (!content || !content.trim()) return {};

    const lines = content.split('\n');
    let parsedTitle;
    let parsedDesc;
    const parsedFields = [];
    let currentField = null;
    const preamble = [];
    let inPreamble = true;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const h1Match = line.match(/^# (.+)/);
        const h2Match = line.match(/^#{2,3} (.+)/);

        if (h1Match && !parsedTitle) {
            parsedTitle = h1Match[1].trim();
            inPreamble = false;
            continue;
        }

        if (h2Match) {
            inPreamble = false;
            if (parsedFields.length >= 25) continue;
            currentField = { name: h2Match[1].trim(), value: '' };
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

    const result = {};
    if (existing.title) result.title = existing.title;
    else if (parsedTitle) result.title = truncate(parsedTitle, 256);

    if (existing.description) result.description = existing.description;
    else if (parsedDesc) result.description = truncate(parsedDesc, 4096);

    if (parsedFields.length > 0) {
        result.fields = parsedFields.map(f => ({
            name: truncate(f.name, 1024),
            value: truncate(f.value.trim(), 1024),
        }));
    }

    result.footer = { text: `Rendered from ${filename}` };

    return result;
}

function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '\u2026';
}
