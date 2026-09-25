import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './supportedLocales.js';

export type LocalizationMap = Record<string, string>;

export interface CommandInput {
    data?: unknown;
    name?: unknown;
    description?: unknown;
    type?: unknown;
    options?: unknown;
    nameLocalizations?: unknown;
    descriptionLocalizations?: unknown;
    name_localizations?: unknown;
    description_localizations?: unknown;
    dmPermission?: unknown;
    pluginId?: unknown;
}

const MAX_LOCALIZED_CHARS = 8000;

function isLocalizationMap(value: unknown): value is LocalizationMap {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string');
}

function mergeMaps(fileMap: LocalizationMap, explicit: unknown): LocalizationMap | null {
    const explicitMap = isLocalizationMap(explicit) ? explicit : {};
    const merged: LocalizationMap = { ...fileMap, ...explicitMap };
    if (Object.keys(merged).length === 0) {
        return null;
    }
    return merged;
}

export function loadCommandLocalizations(pluginDir: string, commandName: string): { nameLocalizations: LocalizationMap; descriptionLocalizations: LocalizationMap } {
    const nameLocalizations: LocalizationMap = {};
    const descriptionLocalizations: LocalizationMap = {};
    for (const locale of SUPPORTED_LOCALES) {
        if (locale === DEFAULT_LOCALE) {
            continue;
        }
        const file = path.join(pluginDir, 'locales', locale, `${commandName}.json`);
        if (!existsSync(file)) {
            continue;
        }
        try {
            const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; description?: unknown };
            if (typeof parsed.name === 'string' && parsed.name.length > 0) {
                nameLocalizations[locale] = parsed.name;
            }
            if (typeof parsed.description === 'string' && parsed.description.length > 0) {
                descriptionLocalizations[locale] = parsed.description;
            }
        } catch {
            continue;
        }
    }
    return { nameLocalizations, descriptionLocalizations };
}

function builderJson(command: CommandInput): Record<string, unknown> | null {
    const data = command.data as { toJSON?: unknown } | null | undefined;
    if (data === undefined || data === null) {
        return null;
    }
    if (typeof data.toJSON !== 'function') {
        return null;
    }
    const json = (data.toJSON as () => unknown)();
    if (typeof json === 'object' && json !== null) {
        return { ...(json as Record<string, unknown>) };
    }
    return {};
}

export function buildCommandPayload(command: CommandInput): Record<string, unknown> {
    const built = builderJson(command);
    if (built !== null) {
        return built;
    }
    const payload: Record<string, unknown> = {
        name: command.name,
        type: (typeof command.type === 'number' ? command.type : 1),
        options: (Array.isArray(command.options) ? command.options : [])
    };
    if (payload['type'] !== 2 && payload['type'] !== 3) {
        payload['description'] = (typeof command.description === 'string' && command.description.length > 0 ? command.description : 'No description');
    }
    const nameLoc = command.nameLocalizations ?? command.name_localizations;
    if (isLocalizationMap(nameLoc)) {
        payload['name_localizations'] = { ...nameLoc };
    }
    const descLoc = command.descriptionLocalizations ?? command.description_localizations;
    if (isLocalizationMap(descLoc)) {
        payload['description_localizations'] = { ...descLoc };
    }
    if (command.dmPermission !== undefined) {
        payload['dm_permission'] = command.dmPermission;
    }
    return payload;
}

export function buildLocalizedPayload(command: CommandInput, pluginDir?: string | null): Record<string, unknown> {
    if (builderJson(command) !== null) {
        return buildCommandPayload(command);
    }
    if (typeof pluginDir !== 'string' || pluginDir.length === 0 || typeof command.name !== 'string') {
        return buildCommandPayload(command);
    }
    const fileLoc = loadCommandLocalizations(pluginDir, command.name);
    const nameLocalizations = mergeMaps(fileLoc.nameLocalizations, command.nameLocalizations ?? command.name_localizations);
    const descriptionLocalizations = mergeMaps(fileLoc.descriptionLocalizations, command.descriptionLocalizations ?? command.description_localizations);
    return buildCommandPayload({
        ...command,
        ...(nameLocalizations !== null ? { nameLocalizations } : {}),
        ...(descriptionLocalizations !== null ? { descriptionLocalizations } : {})
    });
}

export function checkCommandLocales(payloads: Record<string, unknown>[]): string[] {
    const warnings: string[] = [];
    for (const payload of payloads) {
        const name = typeof payload['name'] === 'string' ? payload['name'] : '(unknown)';
        if (typeof payload['description'] !== 'string' || payload['description'].length === 0) {
            warnings.push(`Command "/${name}" has no base description`);
        }
        const descLoc = payload['description_localizations'];
        if (!isLocalizationMap(descLoc)) {
            warnings.push(`Command "/${name}" has no description localizations`);
            continue;
        }
        const combined = Object.values(descLoc).reduce((total, text) => total + text.length, 0);
        if (combined > MAX_LOCALIZED_CHARS) {
            warnings.push(`Command "/${name}" localized descriptions exceed ${MAX_LOCALIZED_CHARS} chars (${combined})`);
        }
    }
    return warnings;
}
