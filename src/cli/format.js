const ESC = '\x1b';
const colors = {
    reset: `${ESC}[0m`,
    green: `${ESC}[32m`,
    red: `${ESC}[31m`,
    yellow: `${ESC}[33m`,
    cyan: `${ESC}[36m`,
    bold: `${ESC}[1m`,
    dim: `${ESC}[2m`
};

function color(code, text) {
    return `${code}${text}${colors.reset}`;
}

export function formatSuccess(message) {
    return color(colors.green, `[SUCCESS] ${message}`);
}

export function formatError(message) {
    return color(colors.red, `[ERROR] ${message}`);
}

export function formatInfo(message) {
    return color(colors.yellow, `[INFO] ${message}`);
}

export function formatTable(headers, rows) {
    if (rows.length === 0) {
        return color(colors.bold, headers.join('  ')) + '\n' + color(colors.dim, '(empty)');
    }

    const colWidths = headers.map((h, i) => {
        const maxData = rows.reduce((max, row) => Math.max(max, String(row[i] || '').length), 0);
        return Math.max(h.length, maxData);
    });

    const headerLine = color(colors.cyan, headers.map((h, i) => h.padEnd(colWidths[i])).join('  '));
    const separator = color(colors.dim, colWidths.map(w => '—'.repeat(w)).join('  '));
    const dataLines = rows.map(row =>
        row.map((cell, i) => String(cell).padEnd(colWidths[i])).join('  ')
    );

    return [headerLine, separator, ...dataLines].join('\n');
}

export function formatList(items) {
    if (items.length === 0) {return '';}
    return items.map(item => `• ${item}`).join('\n');
}
