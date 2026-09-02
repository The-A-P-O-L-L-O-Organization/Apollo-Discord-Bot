// Plugin capability types for sandboxed worker plugins

export type Capability =
    | 'commands'
    | 'events'
    | 'cli'
    | 'rpc'
    | 'database'
    | 'queue'
    | 'schedule'
    | 'interlink'
    | 'web'
    | 'voice'
    | 'analytics'
    | 'metrics'
    | 'moderation'
    | 'tickets'
    | 'levels'
    | 'reminders'
    | 'polls';

export interface CapabilityDefinition {
    name: Capability;
    description: string;
    required: boolean;
    version: string;
    dependencies: Capability[];
    permissions: CapabilityPermission[];
    limits: CapabilityLimits;
}

export type CapabilityPermission =
    | 'read'
    | 'write'
    | 'execute'
    | 'admin'
    | 'guild:read'
    | 'guild:write'
    | 'user:read'
    | 'user:write'
    | 'channel:read'
    | 'channel:write'
    | 'message:read'
    | 'message:write'
    | 'role:read'
    | 'role:write'
    | 'emoji:read'
    | 'emoji:write'
    | 'webhook:read'
    | 'webhook:write'
    | 'integration:read'
    | 'integration:write';

export interface CapabilityLimits {
    maxCommands?: number;
    maxEvents?: number;
    maxCliCommands?: number;
    maxRpcMethods?: number;
    maxDatabaseKeys?: number;
    maxDatabaseKeySize?: number; // bytes
    maxQueueJobsPerMinute?: number;
    maxQueueJobSize?: number; // bytes
    maxScheduledTasks?: number;
    maxInterlinkCallsPerMinute?: number;
    maxWebRequestsPerMinute?: number;
    maxVoiceConnections?: number;
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    timeoutMs?: number;
}

// Default capability definitions
export const CAPABILITY_DEFINITIONS: Record<Capability, CapabilityDefinition> = {
    commands: {
        name: 'commands',
        description: 'Register and handle slash commands',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['guild:read', 'guild:write', 'channel:read', 'user:read'],
        limits: {
            maxCommands: 50,
            maxDatabaseKeys: 100,
            maxDatabaseKeySize: 1024 * 1024, // 1MB
            timeoutMs: 30000
        }
    },
    events: {
        name: 'events',
        description: 'Listen to Discord gateway events',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['guild:read', 'channel:read', 'user:read', 'message:read'],
        limits: {
            maxEvents: 20,
            timeoutMs: 5000
        }
    },
    cli: {
        name: 'cli',
        description: 'Register CLI commands for admin interface',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['admin'],
        limits: {
            maxCliCommands: 20,
            timeoutMs: 60000
        }
    },
    rpc: {
        name: 'rpc',
        description: 'Register and call RPC methods',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['execute'],
        limits: {
            maxRpcMethods: 30,
            maxQueueJobsPerMinute: 100,
            timeoutMs: 30000
        }
    },
    database: {
        name: 'database',
        description: 'Read/write plugin-specific database keys',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['guild:read', 'guild:write', 'user:read', 'user:write'],
        limits: {
            maxDatabaseKeys: 500,
            maxDatabaseKeySize: 1024 * 1024, // 1MB
            timeoutMs: 10000
        }
    },
    queue: {
        name: 'queue',
        description: 'Add jobs to BullMQ queues',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['execute'],
        limits: {
            maxQueueJobsPerMinute: 200,
            maxQueueJobSize: 256 * 1024, // 256KB
            timeoutMs: 300000 // 5 minutes for job processing
        }
    },
    schedule: {
        name: 'schedule',
        description: 'Schedule recurring tasks',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['execute'],
        limits: {
            maxScheduledTasks: 10,
            timeoutMs: 300000
        }
    },
    interlink: {
        name: 'interlink',
        description: 'Call services on other bots via Interlink',
        required: false,
        version: '1.0.0',
        dependencies: ['rpc'],
        permissions: ['execute'],
        limits: {
            maxInterlinkCallsPerMinute: 100,
            timeoutMs: 30000
        }
    },
    web: {
        name: 'web',
        description: 'Make HTTP requests to external APIs',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['execute'],
        limits: {
            maxWebRequestsPerMinute: 60,
            timeoutMs: 30000
        }
    },
    voice: {
        name: 'voice',
        description: 'Connect to voice channels and play audio',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['guild:read', 'channel:read', 'channel:write'],
        limits: {
            maxVoiceConnections: 1,
            maxMemoryMB: 512,
            timeoutMs: 3600000 // 1 hour for voice sessions
        }
    },
    analytics: {
        name: 'analytics',
        description: 'Track analytics events',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['guild:read', 'user:read'],
        limits: {
            maxQueueJobsPerMinute: 1000,
            timeoutMs: 5000
        }
    },
    metrics: {
        name: 'metrics',
        description: 'Record Prometheus metrics',
        required: false,
        version: '1.0.0',
        dependencies: [],
        permissions: ['execute'],
        limits: {
            timeoutMs: 1000
        }
    },
    moderation: {
        name: 'moderation',
        description: 'Perform moderation actions (ban, kick, timeout, etc.)',
        required: false,
        version: '1.0.0',
        dependencies: ['database', 'queue'],
        permissions: ['guild:read', 'guild:write', 'user:read', 'user:write', 'message:write', 'role:write'],
        limits: {
            maxQueueJobsPerMinute: 50,
            timeoutMs: 30000
        }
    },
    tickets: {
        name: 'tickets',
        description: 'Manage support tickets',
        required: false,
        version: '1.0.0',
        dependencies: ['database', 'commands', 'events'],
        permissions: ['guild:read', 'guild:write', 'channel:read', 'channel:write', 'user:read', 'role:read', 'role:write'],
        limits: {
            maxCommands: 10,
            maxEvents: 5,
            maxDatabaseKeys: 200,
            maxQueueJobsPerMinute: 20,
            timeoutMs: 30000
        }
    },
    levels: {
        name: 'levels',
        description: 'Manage XP and leveling system',
        required: false,
        version: '1.0.0',
        dependencies: ['database', 'events'],
        permissions: ['guild:read', 'guild:write', 'user:read', 'user:write', 'role:read', 'role:write'],
        limits: {
            maxDatabaseKeys: 1000,
            maxDatabaseKeySize: 512 * 1024,
            maxQueueJobsPerMinute: 100,
            timeoutMs: 10000
        }
    },
    reminders: {
        name: 'reminders',
        description: 'Create and manage user reminders',
        required: false,
        version: '1.0.0',
        dependencies: ['database', 'commands', 'schedule'],
        permissions: ['guild:read', 'user:read', 'user:write', 'channel:read'],
        limits: {
            maxCommands: 5,
            maxScheduledTasks: 100,
            maxDatabaseKeys: 500,
            maxQueueJobsPerMinute: 50,
            timeoutMs: 30000
        }
    },
    polls: {
        name: 'polls',
        description: 'Create and manage polls',
        required: false,
        version: '1.0.0',
        dependencies: ['database', 'commands', 'events'],
        permissions: ['guild:read', 'guild:write', 'channel:read', 'channel:write', 'user:read', 'message:read', 'message:write'],
        limits: {
            maxCommands: 5,
            maxEvents: 5,
            maxDatabaseKeys: 200,
            maxQueueJobsPerMinute: 20,
            timeoutMs: 30000
        }
    }
};

export interface CapabilityRegistry {
    getDefinition: (capability: Capability) => CapabilityDefinition | undefined;
    getAllDefinitions: () => CapabilityDefinition[];
    validateCapabilities: (capabilities: Capability[]) => CapabilityValidationResult;
    getRequiredCapabilities: (capabilities: Capability[]) => Capability[];
    getEffectiveLimits: (capabilities: Capability[]) => EffectiveLimits;
}

export interface CapabilityValidationResult {
    valid: boolean;
    missingDependencies: Capability[];
    conflictingCapabilities: Capability[];
    warnings: string[];
}

export interface EffectiveLimits {
    maxCommands: number;
    maxEvents: number;
    maxCliCommands: number;
    maxRpcMethods: number;
    maxDatabaseKeys: number;
    maxDatabaseKeySize: number;
    maxQueueJobsPerMinute: number;
    maxQueueJobSize: number;
    maxScheduledTasks: number;
    maxInterlinkCallsPerMinute: number;
    maxWebRequestsPerMinute: number;
    maxVoiceConnections: number;
    maxMemoryMB: number;
    maxCpuPercent: number;
    timeoutMs: number;
}

// Capability manifest for plugins
export interface PluginCapabilityManifest {
    capabilities: Capability[];
    requestedPermissions: CapabilityPermission[];
    requestedLimits: Partial<EffectiveLimits>;
}

export interface CapabilityGrant {
    capability: Capability;
    granted: boolean;
    grantedPermissions: CapabilityPermission[];
    grantedLimits: Partial<CapabilityLimits>;
    reason?: string;
}

export interface PluginSandboxConfig {
    pluginName: string;
    capabilities: CapabilityGrant[];
    allowedGlobals: string[];
    blockedGlobals: string[];
    allowedModules: string[];
    blockedModules: string[];
    resourceLimits: ResourceLimits;
}

export interface ResourceLimits {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxFileDescriptors: number;
    maxChildProcesses: number;
    networkAccess: boolean;
    fileSystemAccess: 'none' | 'read' | 'readwrite' | 'plugin-only';
}