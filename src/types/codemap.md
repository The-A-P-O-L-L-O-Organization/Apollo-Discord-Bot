# src/types/

## Responsibility
Shared strict TypeScript contracts for config, plugins, queue, gateway, database, RPC, and Discord extensions used across bot, workers, and CLI.

## Files

| File | Purpose |
|---|---|
| `capabilities.ts` | Defines plugin capability types for sandboxed worker checks. |
| `cli.ts` | Defines admin CLI command and context contracts. |
| `config.ts` | Defines bot configuration shape (Discord, database, queue, plugin settings). |
| `database.ts` | Defines database connection and record contracts for Knex adapters. |
| `discord.ts` | Re-exports discord.js v14 types plus Apollo client and command extensions. |
| `eventbus.ts` | Defines Redis EventBus event and connection contracts. |
| `gateway.ts` | Defines gateway and leader-election configuration contracts. |
| `index.ts` | Single re-export surface for all type domains. |
| `plugin.ts` | Defines plugin manifest and lifecycle contracts. |
| `queue.ts` | Defines BullMQ job names, payloads, and queue option contracts. |
| `rpc.ts` | Defines socket RPC message, response, and error contracts. |
| `rpc-schemas.ts` | Provides zod runtime schemas for RPC message validation. |
| `shared.ts` | Defines shared Discord interaction and common cross-module contracts. |

## Design
- One module per domain: `config`, `plugin`, `rpc`, `rpc-schemas`, `queue`, `eventbus`, `database`, `discord`, `gateway`, `cli`, `capabilities`, and `shared`.
- `index.ts` is the single re-export surface using explicit `export type` for `verbatimModuleSyntax` compatibility plus value exports for `isApolloConfig` and `RPCSchemas`.
- `no-explicit-any` applies; contracts use `unknown`, precise unions, and zod-backed RPC schemas rather than loose types.
- Patterns: data-only type contracts with no runtime behavior of their own; the `index.ts` barrel is a Facade re-export surface.

## Flow
1. Feature code imports types from `src/types/index.js` or the domain module directly with the `.js` ESM suffix.
2. Queue, RPC, and EventBus payloads are typed at the producer and revalidated at the consumer trust boundary.
3. Schema modules provide runtime validation shapes alongside static types for worker and gateway transport.
4. Changes propagate through typecheck without runtime imports since most entries are type-only.

## Integration
- Consumed by `src/core/`, `src/plugins/`, `src/queue/`, `src/gateway/`, `src/db/`, and `bin/apollo.ts`.
- Discord types re-export discord.js v14 with Apollo client and command module extensions.
- Queue and RPC types must stay synchronized with BullMQ job options and protobuf contracts.
