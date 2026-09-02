// Command module validator using Zod
// Validates plugin command modules at load time

import { z } from 'zod';
import type { 
    PluginCommand, 
    PluginEvent, 
    CLICommand, 
    PluginContext,
    CommandData,
    CommandOption,
    CommandChoice,
    CLICommandOption,
    ParsedArgs
} from '../types/plugin.js';

// Zod schemas for command module validation
export const CommandDataSchema = z.object({
    name: z.string().min(1).max(32).regex(/^[\w-]+$/),
    description: z.string().min(1).max(100),
    options: z.array(z.object({
        name: z.string().min(1).max(32).regex(/^[\w-]+$/),
        description: z.string().min(1).max(100),
        type: z.number().int().min(1).max(12),
        required: z.boolean().optional(),
        choices: z.array(z.object({
            name: z.string().min(1).max(100),
            value: z.union([z.string(), z.number()])
        })).optional(),
        autocomplete: z.boolean().optional(),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        minLength: z.number().int().min(0).optional(),
        maxLength: z.number().int().min(0).optional(),
        channelTypes: z.array(z.number().int()).optional()
    })).optional(),
    defaultMemberPermissions: z.union([z.string(), z.number()]).optional(),
    dmPermission: z.boolean().optional(),
    contexts: z.array(z.number().int()).optional(),
    integrationTypes: z.array(z.number().int()).optional()
});

export const CommandOptionSchema = z.object({
    name: z.string().min(1).max(32).regex(/^[\w-]+$/),
    description: z.string().min(1).max(100),
    type: z.number().int().min(1).max(12),
    required: z.boolean().optional(),
    choices: z.array(z.object({
        name: z.string().min(1).max(100),
        value: z.union([z.string(), z.number()])
    })).optional(),
    autocomplete: z.boolean().optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(0).optional(),
    channelTypes: z.array(z.number().int()).optional()
});

export const CommandChoiceSchema = z.object({
    name: z.string().min(1).max(100),
    value: z.union([z.string(), z.number()])
});

export const PluginCommandSchema = z.object({
    data: CommandDataSchema,
    execute: z.function().args(z.unknown(), z.object({})).returns(z.promise(z.void())),
    autocomplete: z.function().args(z.unknown(), z.object({})).returns(z.promise(z.void())).optional()
});

export const PluginEventSchema = z.object({
    name: z.string().min(1),
    once: z.boolean(),
    execute: z.function().args(z.array(z.unknown())).returns(z.promise(z.void()))
});

export const CLICommandOptionSchema = z.object({
    name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9-]*$/),
    alias: z.string().min(1).max(1).optional(),
    description: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'array']),
    required: z.boolean().optional(),
    default: z.unknown().optional()
});

export const CLICommandSchema = z.object({
    name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9-]*$/),
    description: z.string().min(1),
    options: z.array(CLICommandOptionSchema),
    execute: z.function().args(z.object({}), z.object({})).returns(z.promise(z.void()))
});

export const PluginManifestSchema = z.object({
    name: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
    description: z.string().min(1).max(200),
    author: z.string().min(1),
    license: z.string().optional(),
    main: z.string().min(1),
    capabilities: z.array(z.enum([
        'commands', 'events', 'cli', 'rpc', 'database', 'queue', 
        'schedule', 'interlink', 'web', 'voice'
    ])),
    dependencies: z.record(z.string()).optional(),
    peerDependencies: z.record(z.string()).optional()
});

// Discord.js event names for validation (subset of Events enum)
const DISCORD_EVENTS = [
    'ready',
    'channelCreate', 'channelDelete', 'channelUpdate', 'channelPinsUpdate',
    'threadCreate', 'threadDelete', 'threadUpdate', 'threadListSync', 'threadMemberUpdate', 'threadMembersUpdate',
    'guildCreate', 'guildDelete', 'guildUpdate', 'guildUnavailable', 'guildMemberAdd', 'guildMemberRemove', 
    'guildMemberUpdate', 'guildMemberAvailable', 'guildMembersChunk', 'guildRoleCreate', 'guildRoleDelete', 
    'guildRoleUpdate', 'guildEmojiCreate', 'guildEmojiDelete', 'guildEmojiUpdate', 'guildStickerCreate', 
    'guildStickerDelete', 'guildStickerUpdate', 'guildScheduledEventCreate', 'guildScheduledEventDelete', 
    'guildScheduledEventUpdate', 'guildScheduledEventUserAdd', 'guildScheduledEventUserRemove',
    'messageCreate', 'messageDelete', 'messageUpdate', 'messageDeleteBulk', 'messageReactionAdd', 
    'messageReactionRemove', 'messageReactionRemoveAll', 'messageReactionRemoveEmoji',
    'interactionCreate', 'interactionDelete',
    'voiceStateUpdate', 'voiceServerUpdate',
    'presenceUpdate',
    'typingStart',
    'userUpdate',
    'webhooksUpdate',
    'autoModerationRuleCreate', 'autoModerationRuleUpdate', 'autoModerationRuleDelete',
    'autoModerationActionExecution',
    'applicationCommandPermissionsUpdate',
    'debug', 'error', 'warn', 'shardDisconnect', 'shardError', 'shardReady', 'shardReconnecting', 'shardResume', 'invalidated',
    'stageInstanceCreate', 'stageInstanceDelete', 'stageInstanceUpdate'
] as const;

export const ValidDiscordEventSchema = z.enum(DISCORD_EVENTS);

/**
 * Validates a plugin command module
 */
export class CommandModuleValidator {
    private errors: string[] = [];
    private warnings: string[] = [];

    /**
     * Validate a command module (slash command, context menu, etc.)
     */
    validateCommandModule(module: unknown, moduleName: string): { valid: boolean; errors: string[]; warnings: string[] } {
        this.errors = [];
        this.warnings = [];

        if (!module || typeof module !== 'object') {
            this.errors.push(`${moduleName}: Module must be an object`);
            return this.getResult();
        }

        const mod = module as Record<string, unknown>;

        // Check for required 'data' property
        if (!mod['data']) {
            this.errors.push(`${moduleName}: Missing required 'data' property (SlashCommandBuilder or command data)`);
        } else {
            const dataResult = CommandDataSchema.safeParse(mod['data']);
            if (!dataResult.success) {
                this.errors.push(`${moduleName}: Invalid command data - ${dataResult.error.errors.map(e => e.message).join(', ')}`);
            } else {
                this.validateCommandData(dataResult.data, moduleName);
            }
        }

        // Check for required 'execute' function
        if (!mod['execute'] || typeof mod['execute'] !== 'function') {
            this.errors.push(`${moduleName}: Missing required 'execute' function`);
        }

        // Optional autocomplete
        if (mod['autocomplete'] !== undefined && typeof mod['autocomplete'] !== 'function') {
            this.errors.push(`${moduleName}: 'autocomplete' must be a function if provided`);
        }

        return this.getResult();
    }

    /**
     * Validate command data semantic correctness
     */
    private validateCommandData(data: z.infer<typeof CommandDataSchema>, moduleName: string): void {
        // Check name follows Discord conventions
        if (!/^[a-z][a-z0-9-]*$/.test(data.name)) {
            this.warnings.push(`${moduleName}: Command name should be lowercase with hyphens (got: ${data.name})`);
        }

        // Check description length
        if (data.description.length > 100) {
            this.errors.push(`${moduleName}: Description exceeds 100 characters`);
        }

        // Validate options if present
        if (data.options) {
            const optionNames = new Set<string>();
            for (const opt of data.options) {
                if (optionNames.has(opt.name)) {
                    this.errors.push(`${moduleName}: Duplicate option name '${opt.name}'`);
                }
                optionNames.add(opt.name);

                // Check option name format
                if (!/^[a-z][a-z0-9-]*$/.test(opt.name)) {
                    this.warnings.push(`${moduleName}: Option name '${opt.name}' should be lowercase with hyphens`);
                }

                // Validate autocomplete with choices
                if (opt.autocomplete && opt.choices && opt.choices.length > 0) {
                    this.warnings.push(`${moduleName}: Option '${opt.name}' has both autocomplete and choices - autocomplete takes precedence`);
                }

                // Validate choices format
                if (opt.choices) {
                    const choiceNames = new Set<string>();
                    const choiceValues = new Set<string | number>();
                    for (const choice of opt.choices) {
                        if (choiceNames.has(choice.name)) {
                            this.errors.push(`${moduleName}: Duplicate choice name '${choice.name}' in option '${opt.name}'`);
                        }
                        choiceNames.add(choice.name);
                        if (choiceValues.has(choice.value)) {
                            this.errors.push(`${moduleName}: Duplicate choice value '${choice.value}' in option '${opt.name}'`);
                        }
                        choiceValues.add(choice.value);
                    }
                }
            }
        }

        // Validate defaultMemberPermissions if string
        if (typeof data.defaultMemberPermissions === 'string') {
            // Could validate against PermissionFlagsBits
        }
    }

    /**
     * Validate an event module
     */
    validateEventModule(module: unknown, moduleName: string): { valid: boolean; errors: string[]; warnings: string[] } {
        this.errors = [];
        this.warnings = [];

        if (!module || typeof module !== 'object') {
            this.errors.push(`${moduleName}: Module must be an object`);
            return this.getResult();
        }

        const mod = module as Record<string, unknown>;

        // Check required properties
        if (!mod['name'] || typeof mod['name'] !== 'string') {
            this.errors.push(`${moduleName}: Missing required 'name' property (string)`);
        } else {
            const eventResult = ValidDiscordEventSchema.safeParse(mod['name']);
            if (!eventResult.success) {
                this.warnings.push(`${moduleName}: Event name '${mod['name']}' is not a standard Discord.js event - may be custom`);
            }
        }

        if (typeof mod['once'] !== 'boolean') {
            this.errors.push(`${moduleName}: Missing required 'once' property (boolean)`);
        }

        if (!mod['execute'] || typeof mod['execute'] !== 'function') {
            this.errors.push(`${moduleName}: Missing required 'execute' function`);
        }

        return this.getResult();
    }

    /**
     * Validate a CLI command module
     */
    validateCLIModule(module: unknown, moduleName: string): { valid: boolean; errors: string[]; warnings: string[] } {
        this.errors = [];
        this.warnings = [];

        if (!module || typeof module !== 'object') {
            this.errors.push(`${moduleName}: Module must be an object`);
            return this.getResult();
        }

        const mod = module as Record<string, unknown>;

        const result = CLICommandSchema.safeParse(mod);
        if (!result.success) {
            this.errors.push(`${moduleName}: Invalid CLI command - ${result.error.errors.map(e => e.message).join(', ')}`);
        } else {
            // Check option names are unique
            const optionNames = new Set<string>();
            for (const opt of result.data.options) {
                if (optionNames.has(opt.name)) {
                    this.errors.push(`${moduleName}: Duplicate CLI option name '${opt.name}'`);
                }
                optionNames.add(opt.name);
            }
        }

        return this.getResult();
    }

    /**
     * Validate a plugin manifest
     */
    validateManifest(module: unknown, moduleName: string): { valid: boolean; errors: string[]; warnings: string[] } {
        this.errors = [];
        this.warnings = [];

        if (!module || typeof module !== 'object') {
            this.errors.push(`${moduleName}: Manifest must be an object`);
            return this.getResult();
        }

        const result = PluginManifestSchema.safeParse(module);
        if (!result.success) {
            this.errors.push(`${moduleName}: Invalid plugin manifest - ${result.error.errors.map(e => e.message).join(', ')}`);
        }

        return this.getResult();
    }

    private getResult(): { valid: boolean; errors: string[]; warnings: string[] } {
        return {
            valid: this.errors.length === 0,
            errors: [...this.errors],
            warnings: [...this.warnings]
        };
    }
}

/**
 * Combined validator for entire plugin
 */
export class PluginValidator {
    private commandValidator = new CommandModuleValidator();

    validatePlugin(plugin: {
        manifest: unknown;
        commands?: Map<string, unknown>;
        events?: Map<string, unknown>;
        cliCommands?: Map<string, unknown>;
    }, pluginName: string): { valid: boolean; errors: string[]; warnings: string[] } {
        const allErrors: string[] = [];
        const allWarnings: string[] = [];

        // Validate manifest
        const manifestResult = this.commandValidator.validateManifest(plugin.manifest, `${pluginName}.manifest`);
        allErrors.push(...manifestResult.errors);
        allWarnings.push(...manifestResult.warnings);

        // Validate commands
        if (plugin.commands) {
            for (const [name, cmd] of plugin.commands) {
                const result = this.commandValidator.validateCommandModule(cmd, `${pluginName}.commands.${name}`);
                allErrors.push(...result.errors);
                allWarnings.push(...result.warnings);
            }
        }

        // Validate events
        if (plugin.events) {
            for (const [name, evt] of plugin.events) {
                const result = this.commandValidator.validateEventModule(evt, `${pluginName}.events.${name}`);
                allErrors.push(...result.errors);
                allWarnings.push(...result.warnings);
            }
        }

        // Validate CLI commands
        if (plugin.cliCommands) {
            for (const [name, cmd] of plugin.cliCommands) {
                const result = this.commandValidator.validateCLIModule(cmd, `${pluginName}.cli.${name}`);
                allErrors.push(...result.errors);
                allWarnings.push(...result.warnings);
            }
        }

        // Cross-validation: check capability dependencies
        if (plugin.manifest && typeof plugin.manifest === 'object') {
            const manifest = plugin.manifest as Record<string, unknown>;
            if (Array.isArray(manifest['capabilities'])) {
                this.validateCapabilities(manifest['capabilities'] as string[], plugin, allErrors, allWarnings, pluginName);
            }
        }

        return {
            valid: allErrors.length === 0,
            errors: allErrors,
            warnings: allWarnings
        };
    }

    private validateCapabilities(
        capabilities: string[],
        plugin: { commands?: Map<string, unknown>; events?: Map<string, unknown>; cliCommands?: Map<string, unknown> },
        errors: string[],
        warnings: string[],
        pluginName: string
    ): void {
        const hasCommands = plugin.commands && plugin.commands.size > 0;
        const hasEvents = plugin.events && plugin.events.size > 0;
        const hasCLI = plugin.cliCommands && plugin.cliCommands.size > 0;

        if (hasCommands && !capabilities.includes('commands')) {
            errors.push(`${pluginName}: Has commands but missing 'commands' capability`);
        }
        if (hasEvents && !capabilities.includes('events')) {
            errors.push(`${pluginName}: Has events but missing 'events' capability`);
        }
        if (hasCLI && !capabilities.includes('cli')) {
            errors.push(`${pluginName}: Has CLI commands but missing 'cli' capability`);
        }

        // Warn about unused capabilities
        if (!hasCommands && capabilities.includes('commands')) {
            warnings.push(`${pluginName}: Has 'commands' capability but no commands registered`);
        }
        if (!hasEvents && capabilities.includes('events')) {
            warnings.push(`${pluginName}: Has 'events' capability but no events registered`);
        }
        if (!hasCLI && capabilities.includes('cli')) {
            warnings.push(`${pluginName}: Has 'cli' capability but no CLI commands registered`);
        }
    }
}