import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LOCALES_SEGMENT = '/locales/';
const CANONICAL_LOCALE = 'en-US';
const LEGACY_SINGLE_BRACE_KEYS = ['welcome.message'];
const PLURAL_SUFFIXES = ['_one', '_few', '_many', '_other', '_zero'];
const DOUBLE_BRACE_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const SINGLE_BRACE_PATTERN = /(?<!\{)\{(?!\{)\s*([A-Za-z0-9_]+)\s*\}(?!\})/g;
const NAMESPACE_PATTERN = /getFixedT\s*\(\s*[^,]+,\s*['"]([^'"]+)['"]/g;
const T_CALL_PATTERN = /(?<![A-Za-z0-9_$.])t\s*\(\s*['"]([^'"]+)['"]/g;
const KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export function isExcludedFromManifest(relPath) {
    return relPath.includes(LOCALES_SEGMENT);
}

export function flattenRecords(value, prefix = '', out = {}) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        out[prefix] = value;
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => {
            flattenRecords(entry, prefix.length > 0 ? `${prefix}.${index}` : `${index}`, out);
        });
        return out;
    }
    if (typeof value === 'object' && value !== null) {
        for (const [key, entry] of Object.entries(value)) {
            flattenRecords(entry, prefix.length > 0 ? `${prefix}.${key}` : key, out);
        }
        return out;
    }
    out[prefix] = value;
    return out;
}

export function doubleBraceVars(text) {
    const vars = new Set();
    if (typeof text !== 'string') {
        return vars;
    }
    DOUBLE_BRACE_PATTERN.lastIndex = 0;
    let match = DOUBLE_BRACE_PATTERN.exec(text);
    while (match !== null) {
        vars.add(match[1]);
        match = DOUBLE_BRACE_PATTERN.exec(text);
    }
    return vars;
}

export function singleBraceVars(text) {
    const vars = new Set();
    if (typeof text !== 'string') {
        return vars;
    }
    SINGLE_BRACE_PATTERN.lastIndex = 0;
    let match = SINGLE_BRACE_PATTERN.exec(text);
    while (match !== null) {
        vars.add(match[1]);
        match = SINGLE_BRACE_PATTERN.exec(text);
    }
    return vars;
}

export function checkParity(locales) {
    const errors = [];
    const canonical = locales[CANONICAL_LOCALE] ?? {};
    const canonicalKeys = Object.keys(canonical);
    for (const [lng, dict] of Object.entries(locales)) {
        if (lng === CANONICAL_LOCALE) {
            continue;
        }
        for (const key of canonicalKeys) {
            if (!(key in dict)) {
                errors.push(`parity:${lng}: missing key "${key}" present in ${CANONICAL_LOCALE}`);
            }
        }
    }
    return errors;
}

export function checkExtraKeys(locales) {
    const warnings = [];
    const canonical = locales[CANONICAL_LOCALE] ?? {};
    for (const [lng, dict] of Object.entries(locales)) {
        if (lng === CANONICAL_LOCALE) {
            continue;
        }
        for (const key of Object.keys(dict)) {
            if (!(key in canonical)) {
                warnings.push(`parity:${lng}: extra key "${key}" absent from ${CANONICAL_LOCALE}`);
            }
        }
    }
    return warnings;
}

export function checkEmpty(locales, label = '') {
    const errors = [];
    const prefix = label.length > 0 ? `${label}:` : '';
    for (const [lng, dict] of Object.entries(locales)) {
        for (const [key, value] of Object.entries(dict)) {
            if (typeof value !== 'string' || value.trim().length === 0) {
                errors.push(`empty:${prefix}${lng}: key "${key}" has no usable value`);
            }
        }
    }
    return errors;
}

export function checkInterpolation(canonical, translation, label = '') {
    const errors = [];
    const prefix = label.length > 0 ? `${label}:` : '';
    const allKeys = new Set([...Object.keys(canonical), ...Object.keys(translation)]);
    for (const key of allKeys) {
        const base = canonical[key];
        const text = translation[key];
        if (!LEGACY_SINGLE_BRACE_KEYS.includes(key)) {
            for (const raw of [base, text]) {
                for (const name of singleBraceVars(raw)) {
                    errors.push(`interpolation:${prefix}${key}: uninterpolated "{${name}}" will render literally`);
                }
            }
        }
        if (typeof base === 'string' && typeof text === 'string') {
            const baseVars = doubleBraceVars(base);
            const textVars = doubleBraceVars(text);
            for (const name of baseVars) {
                if (!textVars.has(name)) {
                    errors.push(`interpolation:${prefix}${key}: translation drops "{{${name}}}"`);
                }
            }
        }
    }
    return errors;
}

export function checkAddedVars(canonical, translation, label = '') {
    const warnings = [];
    const prefix = label.length > 0 ? `${label}:` : '';
    for (const key of Object.keys(translation)) {
        const base = canonical[key];
        const text = translation[key];
        if (typeof base === 'string' && typeof text === 'string') {
            const baseVars = doubleBraceVars(base);
            for (const name of doubleBraceVars(text)) {
                if (!baseVars.has(name)) {
                    warnings.push(`interpolation:${prefix}${key}: translation adds "{{${name}}}" absent from ${CANONICAL_LOCALE}`);
                }
            }
        }
    }
    return warnings;
}

export function collectSourceKeys(files) {
    return files.map((file) => {
        const namespaces = new Set();
        NAMESPACE_PATTERN.lastIndex = 0;
        let nsMatch = NAMESPACE_PATTERN.exec(file.content);
        while (nsMatch !== null) {
            namespaces.add(nsMatch[1]);
            nsMatch = NAMESPACE_PATTERN.exec(file.content);
        }
        const keys = new Set();
        T_CALL_PATTERN.lastIndex = 0;
        let keyMatch = T_CALL_PATTERN.exec(file.content);
        while (keyMatch !== null) {
            if (KEY_PATTERN.test(keyMatch[1])) {
                keys.add(keyMatch[1]);
            }
            keyMatch = T_CALL_PATTERN.exec(file.content);
        }
        return { path: file.path, namespaces: [...namespaces], keys: [...keys] };
    });
}

export function checkSourceCoverage(sources, dictionaries) {
    const errors = [];
    for (const source of sources) {
        const candidates = [...source.namespaces, 'common'];
        for (const key of source.keys) {
            const separator = key.indexOf(':');
            const scoped = separator > 0
                ? [{ ns: key.slice(0, separator), key: key.slice(separator + 1) }]
                : candidates.map((ns) => ({ ns, key }));
            const found = scoped.some(({ ns, key: bare }) => {
                const dict = dictionaries[ns] ?? {};
                if (bare in dict) {
                    return true;
                }
                return PLURAL_SUFFIXES.some((suffix) => `${bare}${suffix}` in dict);
            });
            if (!found) {
                errors.push(`extract:${source.path}: t('${key}') missing from ${CANONICAL_LOCALE} dictionaries`);
            }
        }
    }
    return errors;
}

function walkJsonFiles(dir, out = []) {
    let entries = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const name of entries) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            walkJsonFiles(full, out);
        } else if (name.endsWith('.json')) {
            out.push(full);
        }
    }
    return out;
}

function readJsonFlat(file) {
    try {
        return flattenRecords(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
        return null;
    }
}

export async function loadLocaleTree(rootUrl) {
    const root = fileURLToPath(rootUrl);
    const bundles = new Map();
    const addFile = (label, lng, file) => {
        const flat = readJsonFlat(file);
        if (flat === null) {
            return false;
        }
        if (!bundles.has(label)) {
            bundles.set(label, { label, locales: {} });
        }
        bundles.get(label).locales[lng] = flat;
        return true;
    };
    const failures = [];
    for (const file of walkJsonFiles(path.join(root, 'src', 'i18n', 'dictionaries'))) {
        const lng = path.basename(path.dirname(file));
        if (addFile(`core/${path.basename(file, '.json')}`, lng, file) === false) {
            failures.push(`unreadable dictionary file: ${file}`);
        }
    }
    for (const file of walkJsonFiles(path.join(root, 'src', 'plugins'))) {
        const parts = file.split(path.sep);
        const localesIndex = parts.lastIndexOf('locales');
        if (localesIndex < 2) {
            continue;
        }
        const pluginId = parts[localesIndex - 1];
        const lng = parts[localesIndex + 1];
        const ns = path.basename(file, '.json');
        if (typeof lng !== 'string' || lng.length === 0) {
            continue;
        }
        if (addFile(`${pluginId}/${ns}`, lng, file) === false) {
            failures.push(`unreadable locale file: ${file}`);
        }
    }
    return [...bundles.values()].map((bundle) => ({ ...bundle, failures }));
}

export function loadCanonicalNamespaces(rootUrl) {
    const root = fileURLToPath(rootUrl);
    const dictionaries = {};
    const readNs = (ns, file) => {
        const flat = readJsonFlat(file);
        if (flat !== null) {
            dictionaries[ns] = { ...(dictionaries[ns] ?? {}), ...flat };
        }
    };
    for (const file of walkJsonFiles(path.join(root, 'src', 'i18n', 'dictionaries', CANONICAL_LOCALE))) {
        readNs(path.basename(file, '.json') === 'common' ? 'common' : path.basename(file, '.json'), file);
    }
    for (const file of walkJsonFiles(path.join(root, 'src', 'plugins'))) {
        const parts = file.split(path.sep);
        const localesIndex = parts.lastIndexOf('locales');
        if (localesIndex < 2) {
            continue;
        }
        if (parts[localesIndex + 1] !== CANONICAL_LOCALE) {
            continue;
        }
        if (path.basename(file, '.json') !== 'common') {
            continue;
        }
        readNs(parts[localesIndex - 1], file);
    }
    return dictionaries;
}

export function collectTypeScriptSources(rootUrl) {
    const root = fileURLToPath(rootUrl);
    const files = [];
    const walk = (dir) => {
        let entries = [];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }
        for (const name of entries) {
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
                try {
                    files.push({ path: path.relative(root, full).split(path.sep).join('/'), content: readFileSync(full, 'utf8') });
                } catch {
                    continue;
                }
            }
        }
    };
    walk(path.join(root, 'src'));
    return files;
}

async function main() {
    const rootUrl = new URL('../', import.meta.url);
    const errors = [];
    const warnings = [];
    const tree = await loadLocaleTree(rootUrl);
    for (const bundle of tree) {
        errors.push(...bundle.failures.map((failure) => `io:${bundle.label}: ${failure}`));
        errors.push(...checkParity(bundle.locales).map((error) => `${bundle.label}: ${error}`));
        errors.push(...checkEmpty(bundle.locales, bundle.label));
        const canonical = bundle.locales[CANONICAL_LOCALE] ?? {};
            for (const [lng, dict] of Object.entries(bundle.locales)) {
                if (lng === CANONICAL_LOCALE) {
                    continue;
                }
                errors.push(...checkInterpolation(canonical, dict, `${bundle.label}:${lng}`));
                warnings.push(...checkAddedVars(canonical, dict, `${bundle.label}:${lng}`));
            }
        warnings.push(...checkExtraKeys(bundle.locales).map((warning) => `${bundle.label}: ${warning}`));
    }
    const dictionaries = loadCanonicalNamespaces(rootUrl);
    const sources = collectSourceKeys(collectTypeScriptSources(rootUrl));
    errors.push(...checkSourceCoverage(sources, dictionaries));
    for (const warning of warnings) {
        process.stderr.write(`[lint:locales:warn] ${warning}\n`);
    }
    if (errors.length > 0) {
        for (const error of errors) {
            process.stderr.write(`[lint:locales:error] ${error}\n`);
        }
        process.stderr.write(`[lint:locales] ${errors.length} error(s)\n`);
        process.exit(1);
    }
    process.stdout.write(`[lint:locales] OK: ${tree.length} bundle(s), ${sources.length} source file(s)\n`);
}

const invoked = process.argv[1] !== undefined ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (invoked) {
    await main();
}
