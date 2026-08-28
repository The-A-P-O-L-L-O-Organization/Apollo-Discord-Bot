# @apollo/multiplex — Multi-Platform Messaging Framework Design

## 1. Framework Scope & Naming

| **Framework Owns** | **Apollo Keeps** |
|---|---|
| PlatformAdapter interface & base classes | Business logic plugins (moderation, tickets, admin, utility) |
| NormalizedEvent / Message / Interaction / Command types | Knex DB schema & adapter (`src/db/`, `src/utils/db.js`) |
| Capability enum & CapabilityRegistry | BullMQ queue infrastructure (`src/queue/`) |
| IngressSink / Egress interfaces | Interlink RPC (`src/plugins/interlink/`) |
| PlatformCommandBuilder (replaces SlashCommandBuilder) | Worker sandbox (`src/core/worker/`) |
| PlatformEmbed / Component / Modal abstractions | EventBus, plugin manifest, CLI |
| TransportAdapter (connect/disconnect/backpressure) | Config system (`src/config/`) |
| DiscordAdapter, SlackAdapter, MatrixAdapter, TelegramAdapter, StoatAdapter | Logging, startup checks, deploy-commands.js |

**Package:** `@apollo/multiplex` (internal, not published to npm)

---

## 2. Core TypeScript Interfaces

### 2.1 Capability System

```typescript
// src/platform/capabilities.ts

export enum Capability {
  // Core messaging
  MessageSend         = 'message_send',
  MessageEdit         = 'message_edit',
  MessageDelete       = 'message_delete',
  
  // Rich interactions
  TypingIndicator     = 'typing_indicator',
  Reactions           = 'reactions',
  Streaming           = 'streaming',
  Modals              = 'modals',
  EphemeralMessages   = 'ephemeral_messages',
  FileUpload          = 'file_upload',
  
  // Commands & UI
  SlashCommands       = 'slash_commands',
  ThreadTitles        = 'thread_titles',
  SuggestedPrompts    = 'suggested_prompts',
  Components          = 'components',
  
  // Lookup & history
  MessageHistory      = 'message_history',
  UserLookupById      = 'user_lookup_by_id',
  UserLookupByName    = 'user_lookup_by_name',
  BulkSend            = 'bulk_send',
  
  // Permissions & hierarchy
  GuildHierarchy      = 'guild_hierarchy',
  ChannelPermissions  = 'channel_permissions',
  RoleManagement      = 'role_management',
  MemberManagement    = 'member_management',
  
  // Negative capabilities
  SkipIngressDedup    = 'skip_ingress_dedup',
  NoWebhookEgress     = 'no_webhook_egress',
}

export interface CapabilityRegistry {
  readonly platform: PlatformId;
  readonly capabilities: ReadonlySet<Capability>;
  
  has(cap: Capability): boolean;
  requires(cap: Capability): asserts this has cap;
  optional(cap: Capability): boolean;
}
```

### 2.2 Normalized Types

```typescript
// src/platform/entities.ts

export type PlatformId = 'discord' | 'slack' | 'matrix' | 'telegram' | 'stoat';

export interface Actor {
  id: string;
  name: string;
  isBot: boolean;
  avatarUrl?: string;
  platform: PlatformId;
  metadata?: Record<string, unknown>;
}

export interface IdentityContext {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
}

export interface ConversationKey {
  guildId?: string;
  channelId: string;
  threadId?: string;
  platform: PlatformId;
  
  toString(): string;
}

export interface ReplyReference {
  messageId: string;
  conversationKey: ConversationKey;
  senderId?: string;
}

export interface ContentPart {
  type: 'text' | 'image' | 'file' | 'embed' | 'component' | 'sticker';
  data: unknown;
  metadata?: {
    filename?: string;
    mimeType?: string;
    size?: number;
    url?: string;
    width?: number;
    height?: number;
  };
}

export interface NormalizedEvent {
  platform: PlatformId;
  conversationKey: ConversationKey;
  messageId: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  text?: string;
  contentParts?: ContentPart[];
  replyTo?: ReplyReference;
  edited?: boolean;
  pinned?: boolean;
  actor: Actor;
  identityContext: IdentityContext;
  interactionType: 'message' | 'command' | 'reaction' | 'modal_submit' | 'component' | 'thread_start';
  triggerId?: string;
  threadId?: string;
  reaction?: { emoji: string; added: boolean };
  guildId?: string;
  channelScope: 'public' | 'private' | 'dm' | 'thread' | 'announcement';
  raw: unknown;
}

export interface NormalizedInteraction extends NormalizedEvent {
  interactionType: 'command';
  commandName: string;
  commandId?: string;
  options: Record<string, unknown>;
  subcommand?: string;
  subcommandGroup?: string;
  guildId: string;
  member?: NormalizedMember;
  locale?: string;
}

export interface NormalizedMember extends Actor {
  roles: string[];
  joinedAt?: number;
  permissions?: string[];
  premiumSince?: number;
  communicationDisabledUntil?: number;
}

export interface NormalizedCommand {
  name: string;
  description: string;
  parameters?: StandardSchemaV1;
  flags?: {
    guildOnly?: boolean;
    dmEnabled?: boolean;
    nsfw?: boolean;
    beta?: boolean;
    defaultMemberPermissions?: string;
  };
  handler(ctx: CommandContext): Promise<void> | void;
}

export interface CommandContext {
  thread: ThreadRef;
  command: string;
  rawArgs: string;
  options: Record<string, unknown>;
  user: Actor;
  platform: PlatformId;
  interactionRef?: ReplyTarget;
  permissions: string[];
}

export interface ThreadRef {
  conversationKey: ConversationKey;
  send(content: MessageContent): Promise<MessageRef>;
  edit(ref: MessageRef, content: MessageContent): Promise<void>;
  delete(ref: MessageRef): Promise<void>;
  typing(): Promise<void>;
  react(ref: MessageRef, emoji: string): Promise<void>;
}

export interface ReplyTarget {
  type: 'interaction' | 'webhook' | 'channel' | 'dm';
  conversationKey: ConversationKey;
  token?: string;
  messageId?: string;
}

export interface MessageRef {
  messageId: string;
  conversationKey: ConversationKey;
  platform: PlatformId;
}

export type MessageContent = 
  | string
  | { content?: string; embeds?: PlatformEmbed[]; components?: PlatformComponent[]; files?: FileUpload[]; flags?: MessageFlags };

export interface PlatformEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: Date | number;
  footer?: { text: string; iconUrl?: string };
  author?: { name: string; url?: string; iconUrl?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: { url: string };
  image?: { url: string };
  toMarkdown(): string;
}

export interface PlatformComponent {
  type: 'button' | 'select' | 'action_row';
  data: unknown;
}

export interface FileUpload {
  name: string;
  data: Buffer | ReadableStream;
  mimeType?: string;
}

export type MessageFlags = 
  | 'ephemeral'
  | 'crossposted'
  | 'suppress_embeds'
  | 'source_message_deleted'
  | 'urgent'
  | 'thread_notification'
  | 'loading';
```

### 2.3 PlatformAdapter Interface (Complete)

```typescript
// src/platform/adapter.ts

import { IngressSink } from './ingress.ts';

export interface PlatformConfig {
  token: string;
  appId?: string;
  guildId?: string;
  [key: string]: unknown;
}

export interface PlatformAdapter {
  readonly platform: PlatformId;
  readonly capabilities: CapabilityRegistry;
  
  // === Lifecycle ===
  start(sink: IngressSink, config: PlatformConfig): Promise<void>;
  stop(): Promise<void>;
  
  // === Egress (all capability-gated) ===
  post?(target: ReplyTarget, content: MessageContent): Promise<MessageRef>;
  edit?(ref: MessageRef, content: MessageContent): Promise<void>;
  delete?(ref: MessageRef): Promise<void>;
  react?(ref: MessageRef, emoji: string): Promise<{ ok: boolean }>;
  typing?(target: ReplyTarget): Promise<void>;
  upload?(target: ReplyTarget, file: FileUpload): Promise<MessageRef>;
  createThread?(parent: ConversationKey, name: string): Promise<ConversationKey>;
  setThreadTitle?(thread: ConversationKey, title: string): Promise<void>;
  
  // === Commands ===
  registerCommands?(commands: readonly NormalizedCommand[]): Promise<void>;
  unregisterCommands?(commandNames: readonly string[]): Promise<void>;
  
  // === Lookup ===
  lookupUser?(query: string | { id: string } | { username: string }): Promise<Actor>;
  lookupChannel?(query: string | { id: string } | { name: string }): Promise<ConversationKey>;
  fetchMessage?(conversationKey: ConversationKey, messageId: string): Promise<NormalizedEvent>;
  
  // === Permissions ===
  canSend?(actor: Actor, conversationKey: ConversationKey): Promise<boolean>;
  canEdit?(actor: Actor, target: MessageRef): Promise<boolean>;
  canDelete?(actor: Actor, target: MessageRef): Promise<boolean>;
  canManageChannel?(actor: Actor, conversationKey: ConversationKey): Promise<boolean>;
  canKick?(actor: Actor, target: Actor, conversationKey: ConversationKey): Promise<boolean>;
  canBan?(actor: Actor, target: Actor, conversationKey: ConversationKey): Promise<boolean>;
  
  // === Session ===
  getOrCreateSession?(conversationKey: ConversationKey, makeAgent: () => unknown): Promise<unknown>;
}
```

### 2.4 IngressSink Interface

```typescript
// src/platform/ingress.ts

export interface IngressSink {
  // Called by adapters when inbound events arrive
  onMessage(event: NormalizedEvent): Promise<void>;
  onCommand(event: NormalizedInteraction): Promise<void>;
  onReaction(event: NormalizedEvent): Promise<void>;
  onComponent(event: NormalizedEvent): Promise<void>;
  onModalSubmit(event: NormalizedEvent): Promise<void>;
  onThreadStart(event: NormalizedEvent): Promise<void>;
  onUserJoin(event: NormalizedEvent): Promise<void>;
  onUserLeave(event: NormalizedEvent): Promise<void>;
  onMemberUpdate(event: NormalizedEvent): Promise<void>;
  onChannelUpdate(event: NormalizedEvent): Promise<void>;
  onGuildUpdate(event: NormalizedEvent): Promise<void>;
  
  // Error boundary
  onError(error: Error, context: { platform: PlatformId; raw?: unknown }): Promise<void>;
}
```

### 2.5 TransportAdapter Interface

```typescript
// src/platform/transport.ts

export interface BackpressureState {
  healthy: boolean;
  queueDepth: number;
  latencyMs: number;
}

export interface TransportAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getBackpressure(): BackpressureState;
  
  // Lifecycle events for the framework
  onReconnecting: EventEmitter<[], []>;
  onResumed: EventEmitter<[], []>;
  onRateLimited: EventEmitter<{ endpoint: string; retryAfter: number }, []>;
}

export class ExponentialBackoff {
  constructor(
    private baseMs: number,
    private maxMs: number,
    private jitter: 'full' | 'decorrelated' | 'equal',
    private maxRetries: number
  ) {}
  
  nextDelay(attempt: number): number;
  reset(): void;
}
```

### 2.6 Command Builder & Permissions

```typescript
// src/platform/commands.ts

export class PlatformCommandBuilder {
  private data: Partial<NormalizedCommand> = {};
  
  setName(name: string): this;
  setDescription(desc: string): this;
  addStringOption(fn: (opt: StringOptionBuilder) => StringOptionBuilder): this;
  addIntegerOption(fn: (opt: IntegerOptionBuilder) => IntegerOptionBuilder): this;
  addBooleanOption(fn: (opt: BooleanOptionBuilder) => BooleanOptionBuilder): this;
  addUserOption(fn: (opt: UserOptionBuilder) => UserOptionBuilder): this;
  addChannelOption(fn: (opt: ChannelOptionBuilder) => ChannelOptionBuilder): this;
  addRoleOption(fn: (opt: RoleOptionBuilder) => RoleOptionBuilder): this;
  addMentionableOption(fn: (opt: MentionableOptionBuilder) => MentionableOptionBuilder): this;
  addNumberOption(fn: (opt: NumberOptionBuilder) => NumberOptionBuilder): this;
  addAttachmentOption(fn: (opt: AttachmentOptionBuilder) => AttachmentOptionBuilder): this;
  addSubcommand(fn: (cmd: PlatformCommandBuilder) => PlatformCommandBuilder): this;
  addSubcommandGroup(fn: (grp: SubcommandGroupBuilder) => SubcommandGroupBuilder): this;
  setGuildOnly(guildOnly: boolean): this;
  setDmEnabled(enabled: boolean): this;
  setNsfw(nsfw: boolean): this;
  setDefaultMemberPermissions(bitfield: string): this;
  setBeta(beta: boolean): this;
  build(): NormalizedCommand;
}

// Permission model
export type ApolloPermission = 
  | 'message.send'
  | 'message.edit.own' | 'message.edit.any'
  | 'message.delete.own' | 'message.delete.any'
  | 'reaction.add' | 'reaction.remove'
  | 'channel.manage' | 'channel.create'
  | 'role.manage' | 'member.kick' | 'member.ban'
  | 'user.manage' | 'user.invite'
  | 'webhook.manage'
  | 'admin';

export interface PermissionEvaluator {
  hasPermission(actor: Actor, permission: ApolloPermission, scope: { guildId?: string; channelId?: string }): boolean;
  getEffectivePermissions(actor: Actor, conversationKey: ConversationKey): string[];
}
```

---

## 3. Architecture Layers & File Structure

```
src/platform/
├── index.ts                    // Main exports
├── capabilities.ts             // Capability enum, CapabilityRegistry
├── entities.ts                 // NormalizedEvent, Actor, ConversationKey, etc.
├── adapter.ts                  // PlatformAdapter interface
├── ingress.ts                  // IngressSink interface
├── transport.ts                // TransportAdapter, ExponentialBackoff
├── commands.ts                 // PlatformCommandBuilder, NormalizedCommand
├── permissions.ts              // ApolloPermission, PermissionEvaluator
├── rich.ts                     // PlatformEmbed, PlatformComponent, PlatformModal
├── registry.ts                 // AdapterRegistry, CapabilityRegistry
├── errors.ts                   // PlatformError, CapabilityError, TransportError
├── testing/
│   ├── TestAdapter.ts          // In-memory adapter for tests
│   ├── FixtureReplay.ts        // Fixture-based testing
│   └── CapabilityValidator.ts  // Test-time capability checks
└── adapters/
    ├── discord/
    │   ├── DiscordAdapter.ts   // Wraps discord.js Client
    │   ├── DiscordTransport.ts // WebSocket gateway with resume
    │   ├── DiscordCommands.ts  // SlashCommandBuilder → PlatformCommandBuilder
    │   ├── DiscordPermissions.ts // Bitfield → ApolloPermission
    │   └── DiscordEntities.ts  // discord.js → NormalizedEvent
    ├── slack/
    ├── matrix/
    ├── telegram/
    └── stoat/
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Plugin Layer (Apollo)                      │
│  moderation, tickets, admin, utility, custom plugins           │
│  • Use PlatformCommandBuilder                                   │
│  • Receive NormalizedEvent / NormalizedInteraction              │
│  • Check capabilities before using features                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Normalization Layer                           │
│  • IngressSink routes NormalizedEvent to plugins               │
│  • CapabilityRegistry gates feature availability               │
│  • PermissionEvaluator checks ApolloPermission                 │
│  • ThreadRef provides unified send/edit/delete/typing          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ DiscordAdapter│  │  SlackAdapter │  │ MatrixAdapter │
│ (main process)│  │ (worker proc) │  │ (worker proc) │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│discord.js     │  │@slack/bolt    │  │matrix-js-sdk  │
│Gateway/REST   │  │Socket Mode/   │  │Appservice     │
│               │  │Webhooks       │  │/sync API      │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer (Shared)                  │
│  • Knex DB (platform-agnostic)                                 │
│  • BullMQ Queue (platform-agnostic job payload)                │
│  • Interlink RPC (bot-to-bot, platform-agnostic)               │
│  • Worker Sandbox (capability-based isolation)                 │
│  • EventBus (in-memory + Redis pub/sub)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. DiscordAdapter Implementation Plan

| Component | File | Responsibility |
|-----------|------|----------------|
| **DiscordAdapter** | `DiscordAdapter.ts` | Implements `PlatformAdapter`; wraps `discord.js Client`; lifecycle |
| **DiscordTransport** | `DiscordTransport.ts` | Gateway connection, resume (session_id + seq), exponential backoff |
| **DiscordEntities** | `DiscordEntities.ts` | Maps `Interaction`, `Message`, `GuildMember`, `Channel` → `NormalizedEvent` |
| **DiscordCommands** | `DiscordCommands.ts` | `PlatformCommandBuilder` → `SlashCommandBuilder` + REST registration |
| **DiscordPermissions** | `DiscordPermissions.ts` | `PermissionsBitField` + overwrites → `ApolloPermission` |

### Key Implementation Details

**Event Mapping (DiscordEntities):**
```typescript
function toNormalizedEvent(interaction: Interaction): NormalizedEvent | NormalizedInteraction {
  const base = {
    platform: 'discord' as PlatformId,
    conversationKey: makeConversationKey(interaction),
    messageId: interaction.id,
    senderId: interaction.user.id,
    senderName: interaction.user.tag,
    timestamp: Date.now(),
    actor: toActor(interaction.user),
    identityContext: { accessToken: config.token },
    raw: interaction,
  };
  
  if (interaction.isCommand()) {
    return { ...base, interactionType: 'command', ...toNormalizedInteraction(interaction) };
  }
  return { ...base, interactionType: 'message', ... };
}
```

**3-Second Interaction Deadline:**
- `DiscordAdapter.post()` detects `ReplyTarget.type === 'interaction'`
- Uses `interaction.deferReply()` / `interaction.editReply()` for deferred responses
- Background jobs use webhook token via `Routes.webhookMessage(appId, token)`

**Command Registration:**
- Reuse existing `deploy-commands.js` logic via `DiscordCommands.registerCommands()`
- Pushes to Guild (dev) or Global via `@discordjs/rest` + `Routes.applicationCommands()`

---

## 5. Queue Serialization Refactor

### Current (Discord-Specific)
```typescript
// src/queue/serializeInteraction.ts - extracts Discord-specific fields
// src/queue/remoteInteraction.ts - 436-line Discord Interaction mock
```

### New (Platform-Agnostic)

```typescript
// src/queue/serializePlatformInteraction.ts
export function serializePlatformInteraction(
  interaction: NormalizedInteraction
): SerializedJobPayload {
  return {
    platform: interaction.platform,
    conversationKey: interaction.conversationKey.toString(),
    interaction: {
      ...interaction,
      // Remove non-serializable fields
      actor: { ...interaction.actor, metadata: undefined },
      identityContext: { ...interaction.identityContext, accessToken: undefined },
      raw: undefined, // Never serialize raw
    },
  };
}

export interface SerializedJobPayload {
  platform: PlatformId;
  conversationKey: string;
  interaction: NormalizedInteraction;
}

// src/queue/remotePlatformInteraction.ts
export class PlatformRemoteInteraction {
  constructor(private payload: SerializedJobPayload) {}
  
  get conversationKey(): ConversationKey { ... }
  get interaction(): NormalizedInteraction { ... }
  // NO discord.js mock - plugins receive NormalizedInteraction directly
}

// src/queue/jobs/processCommand.ts
// Receives NormalizedInteraction, routes to command handler via PlatformCommandBuilder
```

**Benefits:**
- Workers no longer reconstruct Discord mock objects
- Queue payload is platform-agnostic
- BullMQ job processing works for any platform

---

## 6. Command System Migration (80+ Commands)

### PlatformCommandBuilder API (Mirror SlashCommandBuilder)

```typescript
// Migration example:
/* BEFORE (Discord-specific) */
const cmd = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason'))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

/* AFTER (Platform-agnostic) */
const cmd = new PlatformCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason'))
  .setDefaultMemberPermissions('member.ban'); // ApolloPermission string
```

### Migration Steps

1. **Create `PlatformCommandBuilder`** in `src/platform/commands.ts`
2. **Codemod** all `src/plugins/*/commands/*.js`:
   - `import { SlashCommandBuilder } from 'discord.js'` → `import { PlatformCommandBuilder } from '#platform/commands'`
   - `new SlashCommandBuilder()` → `new PlatformCommandBuilder()`
   - `.setDefaultMemberPermissions(PermissionFlagsBits.X)` → `.setDefaultMemberPermissions('apollo.permission')`
3. **Update `deploy-commands.js`** → per-platform deployment scripts:
   - `deploy-commands-discord.js` (REST push)
   - `deploy-commands-slack.js` (manifest update)
   - `deploy-commands-matrix.js` (no-op, text prefix)
4. **Plugin registration:** Add `providesCommands: NormalizedCommand[]` to `PlatformPlugin`

---

## 7. Plugin Integration (Adapters as Apollo Plugins)

```typescript
// Extend existing Plugin class in src/core/Plugin.js

interface PlatformPlugin extends Plugin {
  readonly providesPlatforms: readonly PlatformId[];
  
  // Called during onEnable
  createAdapter(config: PlatformConfig): PlatformAdapter;
  
  // Optional validation
  validateCommands?(commands: readonly NormalizedCommand[]): ValidationError[];
}

// In PluginManager.loadPlugin():
// 1. If plugin providesPlatforms, instantiate adapter
// 2. Register adapter in AdapterRegistry
// 3. Adapter.start() connects transport
// 4. Adapter.registerCommands() pushes commands (Discord)
// 5. Plugin.onEnable() runs with adapter available
```

**Benefits:**
- Reuses PluginManager lifecycle, sandboxing, config, queue, Interlink
- Adapters get worker isolation automatically via existing `src/core/worker/`
- Config stored via Knex adapter (`src/utils/db.js`)

---

## 8. Migration Phases with Effort Estimates

| Phase | Work | Effort | Dependencies |
|-------|------|--------|--------------|
| **P0** | Framework core (interfaces, registry, entities, capabilities) | 1 week | — |
| **P0** | DiscordAdapter (wrap existing discord.js) | 2-3 weeks | P0 core |
| **P1** | Queue serialization refactor | 1-2 weeks | DiscordAdapter |
| **P1** | PlatformCommandBuilder + codemod 80 commands | 2-3 weeks | P0 core |
| **P1** | deploy-commands.js → per-platform scripts | 1 week | PlatformCommandBuilder |
| **P2** | Permissions (ApolloPermission + DiscordPermissions) | 1-2 weeks | DiscordAdapter |
| **P2** | Rich messages (PlatformEmbed/Component/Modal) | 1 week | DiscordAdapter |
| **P3** | SlackAdapter (native, worker process) | 2-3 weeks | P0 core |
| **P3** | MatrixAdapter (native, worker process) | 3-4 weeks | P0 core |
| **P3** | TelegramAdapter (native, worker process) | 2-3 weeks | P0 core |
| **P4** | StoatAdapter (research API first) | TBD | P0 core |

**Total to Discord-only feature parity:** ~6-8 weeks  
**Total to 4-platform support:** ~12-16 weeks

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Discord API breaks adapter | High | High | Adapter isolates discord.js; version pinning; integration tests |
| Capability gaps cause runtime failures | Medium | High | Capability validation at plugin registration (test-time) |
| Event normalization loses platform features | Medium | Medium | `raw` escape hatch preserved; opt-in platform-specific extensions |
| Queue serialization performance | Low | Medium | Benchmark NormalizedEvent overhead; pool objects if needed |
| Maintenance burden (5+ adapters) | High | High | Shared test harness; automated capability compliance tests; deprecation policy |
| Stoat API unknown | High | Unknown | Spike research first; bridge fallback if API insufficient |
| Command codemod misses edge cases | Medium | Medium | Automated tests per command; manual review of complex commands |
| Permission model mismatch | Medium | High | Comprehensive test matrix; adapter translates at boundary |

---

## 10. Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Capability enum over interface inheritance | Simpler composition; duck-typed optional methods | CopilotKit-style full interface (too large, rigid) |
| Standard Schema for command params | Schema-agnostic; Zod/Valibot/ArkType all work | Discord-specific typed options only (not portable) |
| `raw` field in NormalizedEvent | Escape hatch prevents abstraction leaks | Strict normalization (breaks on edge cases) |
| Adapters as Apollo plugins | Reuses PluginManager, sandboxing, config, queue | Separate adapter manager (duplication) |
| Discord in main process, others in workers | Discord.js deeply integrated; others isolated | All in workers (more refactor, no benefit) |
| Bridge fallback for low-priority platforms | Zero maintenance for niche platforms | Native adapters for all (unsustainable) |
| Capability-gated over feature detection | Capability mismatch = config error, not runtime | Feature detection (fragile, implicit) |
| PlatformCommandBuilder mirrors SlashCommandBuilder | Zero learning curve; easy codemod | New API (requires manual rewrite) |
| NormalizedInteraction extends NormalizedEvent | Commands are events; single handler interface | Separate type hierarchy (duplication) |

---

## Appendix: Research Sources

- **Bottender**: Connector + Router pattern (2,156 snippets, High reputation)
- **MS Bot Framework**: Activity + TurnContext + Middleware (1,053 snippets, High reputation)
- **CopilotKit/agent-native**: PlatformAdapter + IngressSink + SurfaceCapabilities (MIT license, direct source read)
- **Lightning**: 8-method Plugin interface, channel-based events (Go, v0.9.3)
- **Matterbridge**: Bridger + Gateway (config-driven relay, Go)
- **matrix-appservice-bridge**: Puppeting + Intents + Appservice (TypeScript)
- **Apollo codebase analysis**: 60+ files with Discord.js coupling identified

---

*Generated from @oracle and @librarian research sessions. This document represents the consolidated architectural decision for building @apollo/multiplex.*