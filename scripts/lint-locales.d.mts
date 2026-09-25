export interface LocaleDict {
    [key: string]: string;
}

export interface LocaleMap {
    [lng: string]: LocaleDict;
}

export interface LocaleBundle {
    label: string;
    locales: LocaleMap;
    failures: string[];
}

export interface SourceFile {
    path: string;
    content: string;
}

export interface CollectedSource {
    path: string;
    namespaces: string[];
    keys: string[];
}

export function isExcludedFromManifest(relPath: string): boolean;
export function flattenRecords(value: unknown, prefix?: string, out?: Record<string, unknown>): Record<string, unknown>;
export function doubleBraceVars(text: unknown): Set<string>;
export function singleBraceVars(text: unknown): Set<string>;
export function checkParity(locales: LocaleMap): string[];
export function checkExtraKeys(locales: LocaleMap): string[];
export function checkEmpty(locales: LocaleMap, label?: string): string[];
export function checkInterpolation(canonical: LocaleDict, translation: LocaleDict, label?: string): string[];
export function checkAddedVars(canonical: LocaleDict, translation: LocaleDict, label?: string): string[];
export function collectSourceKeys(files: SourceFile[]): CollectedSource[];
export function checkSourceCoverage(sources: CollectedSource[], dictionaries: Record<string, LocaleDict>): string[];
export function loadLocaleTree(rootUrl: URL): Promise<LocaleBundle[]>;
export function loadCanonicalNamespaces(rootUrl: URL): Record<string, LocaleDict>;
export function collectTypeScriptSources(rootUrl: URL): SourceFile[];
