import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { i18n } from './index.js';

function parseLocalePath(file: string): { lng: string; ns: string } | null {
    const parts = file.split(path.sep);
    const localesIndex = parts.lastIndexOf('locales');
    if (localesIndex >= 0 && localesIndex + 1 < parts.length) {
        return { lng: parts[localesIndex + 1]!, ns: parts[localesIndex - 1]! };
    }
    const dictionariesIndex = parts.lastIndexOf('dictionaries');
    if (dictionariesIndex >= 0 && dictionariesIndex + 2 < parts.length) {
        const base = parts[parts.length - 1]!;
        return { lng: parts[dictionariesIndex + 1]!, ns: base.replace(/\.json$/, '') };
    }
    return null;
}

export function startLocaleWatcher(): FSWatcher {
    const watcher = watch(['src/i18n/dictionaries/**/*.json', 'src/plugins/*/locales/**/*.json'], {
        ignoreInitial: true
    });
    watcher.on('change', (file) => {
        const parsed = parseLocalePath(file);
        if (parsed === null) {
            return;
        }
        void i18n.reloadResources(parsed.lng, parsed.ns);
    });
    return watcher;
}
