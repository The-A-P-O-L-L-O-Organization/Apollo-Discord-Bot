// Re-exports all type modules for convenient importing
// Explicit re-exports to avoid conflicts
// Using 'export type' for verbatimModuleSyntax compatibility

// Config types
export type {
    DiscordConfig,
    DatabaseConfig,
    RedisConfig,
    QueueRedisConfig,
    QueueConfig,
    InterlinkConfig,
    ShardConfig,
    OperatorConfig,
    PluginConfig,
    AutomodConfig,
    WarningThresholds,
    WarningsConfig,
    TicketsConfig,
    LevelsConfig,
    LoggingConfig,
    RemindersConfig,
    PollsConfig,
    IntegrationsConfig,
    ReactionRolesConfig,
    ApolloConfig
} from './config.js';
export { isApolloConfig } from './config.js';

// Plugin types
export type {
    PluginManifest,
    PluginCapability,
    PluginConfig as PluginConfigType,
    PluginContext,
    PluginLogger,
    PluginDatabase,
    PluginQueue,
    JobOptions,
    Job,
    QueueInstance,
    JobType,
    PluginRPC,
    RPCHandler,
    RPCContext,
    PluginScheduler,
    PluginInterlink,
    InterlinkHandler,
    InterlinkContext,
    BasePlugin,
    CommandPlugin,
    EventPlugin,
    CLIPlugin,
    RPCPlugin,
    PluginCommand,
    CommandData,
    CommandOption,
    CommandChoice,
    PluginEvent,
    ParsedArgs
} from './plugin.js';

// RPC types
export type {
    RPCMessage,
    RPCResponse,
    RPCError,
    RPCHandler as RPCHandlerType,
    RPCContext as RPCContextType,
    RPCNamespace,
    RPCMiddleware,
    RPCClient,
    RPCServer,
    WorkerRPCMessage,
    WorkerRPCResponse,
    WorkerJobData,
    GatewayRPCMessage,
    ShardInfo,
    GatewayCommandPayload,
    InterlinkRPCMessage,
    InterlinkService,
    InterlinkMethod,
    InterlinkContext as InterlinkContextType
} from './rpc.js';

// RPC Schemas
export type {
    RPCMessageSchema,
    RPCResponseSchema,
    RPCErrorSchema,
    WorkerJobDataSchema,
    WorkerResultSchema,
    ShardInfoSchema,
    GatewayCommandPayloadSchema,
    InterlinkContextSchema,
    InterlinkRPCMessageSchema,
    ProcessCommandJobSchema,
    HeavyOperationJobSchema,
    ScheduledTaskJobSchema,
    NSFWAnalyzeJobSchema,
    PluginRPCRegisterSchema,
    PluginRPCCallSchema,
    DatabaseGetSchema,
    DatabaseSetSchema,
    AnalyticsTrackMessageSchema,
    AnalyticsTrackViolationSchema,
    ModerationActionSchema,
    RPCSchemasType,
    InferSchema,
    ProcessCommandJob,
    HeavyOperationJob,
    ScheduledTaskJob,
    NSFWAnalyzeJob
} from './rpc-schemas.js';
export { RPCSchemas } from './rpc-schemas.js';

// Queue types
export type {
    JobName,
    QueueJobDataMap,
    ProcessCommandJobData,
    HeavyOperationJobData,
    ScheduledTaskJobData,
    NSFWAnalyzeJobData,
    AnalyticsFlushJobData,
    ModerationActionJobData,
    WebhookDeliverJobData,
    EmailSendJobData,
    BackupCreateJobData,
    CleanupExpiredJobData,
    SerializedInteraction,
    SerializedUser,
    SerializedMember,
    SerializedCommandData,
    SerializedCommandOption,
    QueueConfig as QueueConfigType,
    RedisConnectionConfig,
    DefaultJobOptions,
    BackoffOptions,
    RemoveOptions,
    JobSerializer,
    QueueMetrics,
    QueueHealthCheck,
    WorkerProcessor,
    WorkerResult,
    WorkerOptions,
    RateLimiterOptions,
    QueueManager
} from './queue.js';

// EventBus types
export type {
    EventBusConfig,
    EventBusMessage,
    EventSource,
    EventSubscription,
    EventFilter,
    EventBus,
    PublishOptions,
    SubscribeOptions,
    Subscription,
    EventBusHealth,
    BotEvents
} from './eventbus.js';

// Database types
export type {
    DatabaseConfig as DatabaseConfigType,
    PoolConfig,
    MigrationConfig,
    Repository,
    GuildData,
    UserData,
    MigrationRecord,
    QueryBuilderExtensions,
    DatabaseAdapter,
    TransactionCallback,
    DatabaseHealth
} from './database.js';

// Discord types (re-exports from discord.js with Apollo extensions)
export type {
    Client as DiscordClient,
    ClientOptions,
    User as DiscordUser,
    Guild as DiscordGuild,
    Channel as DiscordChannel,
    GuildMember as DiscordGuildMember,
    Message as DiscordMessage,
    Interaction as DiscordInteraction,
    CommandInteraction,
    ButtonInteraction,
    SelectMenuInteraction,
    ModalSubmitInteraction,
    ContextMenuCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ModalBuilder,
    TextInputBuilder,
    SlashCommandBuilder,
    APIEmbed,
    Events as DiscordEvents,
    REST,
    Routes,
    ApolloClientExtensions,
    CommandBuilder,
    SlashCommandModule,
    ContextMenuCommandModule,
    AutocompleteHandler,
    ComponentHandler,
    ModalHandler
} from './discord.js';

// Capabilities types
export type {
    Capability,
    CapabilityDefinition,
    CAPABILITY_DEFINITIONS,
    CapabilityRegistry,
    CapabilityValidationResult,
    EffectiveLimits,
    PluginCapabilityManifest,
    CapabilityGrant,
    PluginSandboxConfig,
    ResourceLimits
} from './capabilities.js';

// Gateway types
export type {
    GatewayConfig,
    ShardConfig as ShardConfigType,
    ShardStatus,
    ShardManagerEvents,
    ShardInfo as ShardInfoType,
    GatewayEvents,
    GatewayClient,
    ShardManager,
    Shard,
    BroadcastPayload,
    EvalOptions,
    GuildManager,
    ChannelManager,
    UserManager,
    VoiceManager,
    RESTManager,
    ApplicationManager,
    LeaderElectionConfig,
    LeaderInfo,
    GatewayRPC
} from './gateway.js';

// CLI types
export type {
    CLIConfig,
    CLICommand,
    CLICommandOption,
    CLIArgument,
    CLIGlobalOption,
    CLIHelpOptions,
    CLIAction,
    ParsedCLIOptions,
    CLIContext,
    CLILogger,
    CLIProgressBar,
    CLIOutput,
    CLIResult,
    CLIError,
    BUILTIN_COMMANDS,
    CLIApplication
} from './cli.js';

// Command Validator - conditional export to avoid circular
// export { CommandModuleValidator, PluginValidator } from './commandValidator.js';