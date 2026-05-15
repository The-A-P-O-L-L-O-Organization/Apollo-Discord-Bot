export function parseArgs(argv) {
    const path = [];
    const flags = Object.create(null);
    let i = 0;

    while (i < argv.length) {
        const arg = argv[i];

        if (arg === '--') {
            // Everything after -- is positional
            path.push(...argv.slice(i + 1));
            break;
        }

        if (arg === '--help') {
            flags.help = true;
            i++;
            continue;
        }

        if (arg.startsWith('--')) {
            const eqIndex = arg.indexOf('=');
            if (eqIndex !== -1) {
                const name = arg.slice(2, eqIndex);
                const value = arg.slice(eqIndex + 1);
                flags[name] = value;
                i++;
                continue;
            }

            const name = arg.slice(2);
            const next = argv[i + 1];

            if (next !== undefined && !next.startsWith('--')) {
                flags[name] = next;
                i += 2;
            } else {
                flags[name] = true;
                i++;
            }
            continue;
        }

        path.push(arg);
        i++;
    }

    return { path, flags };
}
