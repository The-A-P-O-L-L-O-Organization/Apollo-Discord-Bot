// Discord.js extended types and utilities

import type {
    Client,
    Guild,
    Channel,
    User,
    GuildMember,
    Message,
    Interaction,
    CommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    SelectMenuInteraction,
    ModalSubmitInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandInteraction,
    GuildTextBasedChannel,
    DMChannel,
    NewsChannel,
    ThreadChannel,
    VoiceChannel,
    StageChannel,
    CategoryChannel,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    PermissionFlagsBits,
    GatewayIntentBits,
    Partials,
    ClientOptions,
    Events,
    REST,
    Routes,
    APIApplicationCommand,
    APIApplicationCommandOption,
    APIEmbed,
    APIMessage,
    APIUser,
    APIGuild,
    APIChannel,
    RESTPostAPIApplicationCommandsJSONBody,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
    Role,
    Attachment,
    Collection,
    Snowflake,
    APIButtonComponentWithCustomId,
    APISelectMenuComponent,
    APIModalInteractionResponseCallbackData,
    APIApplicationCommandInteractionDataBasicOption,
    APICommandAutocompleteInteractionResponseCallbackData,
    IntentsBitField
} from 'discord.js';

// Re-export commonly used types from discord.js
export type {
    Client,
    Guild,
    Channel,
    User,
    GuildMember,
    Message,
    Interaction,
    CommandInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    SelectMenuInteraction,
    ModalSubmitInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandInteraction,
    GuildTextBasedChannel,
    DMChannel,
    NewsChannel,
    ThreadChannel,
    VoiceChannel,
    StageChannel,
    CategoryChannel,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    PermissionFlagsBits,
    GatewayIntentBits,
    Partials,
    ClientOptions,
    Events,
    REST,
    Routes,
    APIApplicationCommand,
    APIApplicationCommandOption,
    APIEmbed,
    APIMessage,
    APIUser,
    APIGuild,
    APIChannel,
    RESTPostAPIApplicationCommandsJSONBody,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
    Role,
    Attachment,
    Collection,
    Snowflake,
    APIButtonComponentWithCustomId,
    APISelectMenuComponent,
    APIModalInteractionResponseCallbackData,
    APIApplicationCommandInteractionDataBasicOption,
    APICommandAutocompleteInteractionResponseCallbackData,
    IntentsBitField
};

// Extended types for Apollo - import from shared.ts
import type {
    ApolloConfig,
    ApolloClientExtensions,
    PluginManager,
    PluginInstance,
    PluginCommand,
    PluginEvent,
    CLICommand,
    CLICommandOption,
    ParsedArgs,
    PluginContext,
    AnalyticsInstance,
    AnalyticsStats,
    MetricsInstance,
    HealthCheckInstance,
    HealthCheckResult,
    ComponentHealth,
    CommandData,
    CommandOption,
    CommandChoice,
    RPCHandler
} from './shared.js';

export interface DiscordClient extends Client {
    apollo: ApolloClientExtensions;
}

// Re-export shared types
export type {
    ApolloConfig,
    ApolloClientExtensions,
    PluginManager,
    PluginInstance,
    PluginCommand,
    PluginEvent,
    CLICommand,
    CLICommandOption,
    ParsedArgs,
    PluginContext,
    AnalyticsInstance,
    AnalyticsStats,
    MetricsInstance,
    HealthCheckInstance,
    HealthCheckResult,
    ComponentHealth,
    CommandData,
    CommandOption,
    CommandChoice,
    RPCHandler
} from './shared.js';

// Command builder types
export interface SlashCommandBuilder {
    setName: (name: string) => SlashCommandBuilder;
    setDescription: (description: string) => SlashCommandBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => SlashCommandBuilder;
    setDefaultMemberPermissions: (permissions: bigint | null) => SlashCommandBuilder;
    setDMPermission: (enabled: boolean) => SlashCommandBuilder;
    setContexts: (contexts: number[]) => SlashCommandBuilder;
    setIntegrationTypes: (types: number[]) => SlashCommandBuilder;
    addStringOption: (option: (builder: StringOptionBuilder) => StringOptionBuilder) => SlashCommandBuilder;
    addIntegerOption: (option: (builder: IntegerOptionBuilder) => IntegerOptionBuilder) => SlashCommandBuilder;
    addNumberOption: (option: (builder: NumberOptionBuilder) => NumberOptionBuilder) => SlashCommandBuilder;
    addBooleanOption: (option: (builder: BooleanOptionBuilder) => BooleanOptionBuilder) => SlashCommandBuilder;
    addUserOption: (option: (builder: UserOptionBuilder) => UserOptionBuilder) => SlashCommandBuilder;
    addChannelOption: (option: (builder: ChannelOptionBuilder) => ChannelOptionBuilder) => SlashCommandBuilder;
    addRoleOption: (option: (builder: RoleOptionBuilder) => RoleOptionBuilder) => SlashCommandBuilder;
    addMentionableOption: (option: (builder: MentionableOptionBuilder) => MentionableOptionBuilder) => SlashCommandBuilder;
    addAttachmentOption: (option: (builder: AttachmentOptionBuilder) => AttachmentOptionBuilder) => SlashCommandBuilder;
    addSubcommand: (option: (builder: SubcommandBuilder) => SubcommandBuilder) => SlashCommandBuilder;
    addSubcommandGroup: (option: (builder: SubcommandGroupBuilder) => SubcommandGroupBuilder) => SlashCommandBuilder;
    toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface SubcommandBuilder {
    setName: (name: string) => SubcommandBuilder;
    setDescription: (description: string) => SubcommandBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => SubcommandBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => SubcommandBuilder;
    addStringOption: (option: (builder: StringOptionBuilder) => StringOptionBuilder) => SubcommandBuilder;
    addIntegerOption: (option: (builder: IntegerOptionBuilder) => IntegerOptionBuilder) => SubcommandBuilder;
    addNumberOption: (option: (builder: NumberOptionBuilder) => NumberOptionBuilder) => SubcommandBuilder;
    addBooleanOption: (option: (builder: BooleanOptionBuilder) => BooleanOptionBuilder) => SubcommandBuilder;
    addUserOption: (option: (builder: UserOptionBuilder) => UserOptionBuilder) => SubcommandBuilder;
    addChannelOption: (option: (builder: ChannelOptionBuilder) => ChannelOptionBuilder) => SubcommandBuilder;
    addRoleOption: (option: (builder: RoleOptionBuilder) => RoleOptionBuilder) => SubcommandBuilder;
    addMentionableOption: (option: (builder: MentionableOptionBuilder) => MentionableOptionBuilder) => SubcommandBuilder;
    addAttachmentOption: (option: (builder: AttachmentOptionBuilder) => AttachmentOptionBuilder) => SubcommandBuilder;
}

export interface SubcommandGroupBuilder {
    setName: (name: string) => SubcommandGroupBuilder;
    setDescription: (description: string) => SubcommandGroupBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => SubcommandGroupBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => SubcommandGroupBuilder;
    addSubcommand: (option: (builder: SubcommandBuilder) => SubcommandBuilder) => SubcommandGroupBuilder;
}

export interface StringOptionBuilder {
    setName: (name: string) => StringOptionBuilder;
    setDescription: (description: string) => StringOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => StringOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => StringOptionBuilder;
    setRequired: (required: boolean) => StringOptionBuilder;
    setAutocomplete: (enabled: boolean) => StringOptionBuilder;
    setMinLength: (length: number) => StringOptionBuilder;
    setMaxLength: (length: number) => StringOptionBuilder;
    setChoices: (choices: readonly { name: string; value: string }[]) => StringOptionBuilder;
    addChoices: (...choices: { name: string; value: string }[]) => StringOptionBuilder;
}

export interface IntegerOptionBuilder {
    setName: (name: string) => IntegerOptionBuilder;
    setDescription: (description: string) => IntegerOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => IntegerOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => IntegerOptionBuilder;
    setRequired: (required: boolean) => IntegerOptionBuilder;
    setAutocomplete: (enabled: boolean) => IntegerOptionBuilder;
    setMinValue: (value: number) => IntegerOptionBuilder;
    setMaxValue: (value: number) => IntegerOptionBuilder;
    setChoices: (choices: readonly { name: string; value: number }[]) => IntegerOptionBuilder;
    addChoices: (...choices: { name: string; value: number }[]) => IntegerOptionBuilder;
}

export interface NumberOptionBuilder {
    setName: (name: string) => NumberOptionBuilder;
    setDescription: (description: string) => NumberOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => NumberOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => NumberOptionBuilder;
    setRequired: (required: boolean) => NumberOptionBuilder;
    setAutocomplete: (enabled: boolean) => NumberOptionBuilder;
    setMinValue: (value: number) => NumberOptionBuilder;
    setMaxValue: (value: number) => NumberOptionBuilder;
    setChoices: (choices: readonly { name: string; value: number }[]) => NumberOptionBuilder;
    addChoices: (...choices: { name: string; value: number }[]) => NumberOptionBuilder;
}

export interface BooleanOptionBuilder {
    setName: (name: string) => BooleanOptionBuilder;
    setDescription: (description: string) => BooleanOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => BooleanOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => BooleanOptionBuilder;
    setRequired: (required: boolean) => BooleanOptionBuilder;
}

export interface UserOptionBuilder {
    setName: (name: string) => UserOptionBuilder;
    setDescription: (description: string) => UserOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => UserOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => UserOptionBuilder;
    setRequired: (required: boolean) => UserOptionBuilder;
    setChannelTypes: (types: number[]) => UserOptionBuilder;
}

export interface ChannelOptionBuilder {
    setName: (name: string) => ChannelOptionBuilder;
    setDescription: (description: string) => ChannelOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => ChannelOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => ChannelOptionBuilder;
    setRequired: (required: boolean) => ChannelOptionBuilder;
    setChannelTypes: (types: number[]) => ChannelOptionBuilder;
}

export interface RoleOptionBuilder {
    setName: (name: string) => RoleOptionBuilder;
    setDescription: (description: string) => RoleOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => RoleOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => RoleOptionBuilder;
    setRequired: (required: boolean) => RoleOptionBuilder;
}

export interface MentionableOptionBuilder {
    setName: (name: string) => MentionableOptionBuilder;
    setDescription: (description: string) => MentionableOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => MentionableOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => MentionableOptionBuilder;
    setRequired: (required: boolean) => MentionableOptionBuilder;
}

export interface AttachmentOptionBuilder {
    setName: (name: string) => AttachmentOptionBuilder;
    setDescription: (description: string) => AttachmentOptionBuilder;
    setNameLocalizations: (localizations: Record<string, string>) => AttachmentOptionBuilder;
    setDescriptionLocalizations: (localizations: Record<string, string>) => AttachmentOptionBuilder;
    setRequired: (required: boolean) => AttachmentOptionBuilder;
}

// Module types for command/event registration
export interface CommandBuilder {
    data: SlashCommandBuilder;
    execute: (interaction: CommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface SlashCommandModule {
    data: SlashCommandBuilder;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface ContextMenuCommandModule {
    data: RESTPostAPIContextMenuApplicationCommandsJSONBody;
    execute: (interaction: ContextMenuCommandInteraction) => Promise<void>;
}

export interface AutocompleteHandler {
    (interaction: AutocompleteInteraction): Promise<void>;
}

export interface ComponentHandler {
    (interaction: ButtonInteraction | SelectMenuInteraction): Promise<void>;
}

export interface ModalHandler {
    (interaction: ModalSubmitInteraction): Promise<void>;
}

// Additional Discord.js API types
export type GatewayDispatchEvents = Events;
export type APIActionRowComponent = APIButtonComponentWithCustomId | APISelectMenuComponent;
export type CommandOptionType = APIApplicationCommandOption['type'];
export type ApplicationCommandType = APIApplicationCommand['type'];