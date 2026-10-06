# tests/mocks/

## Responsibility
Provides deterministic discord.js v14 mocks for unit and integration tests, enabling isolated testing of bot logic without Discord API calls.

## Files

| File | Purpose |
|------|---------|
| `discord.ts` | Typed discord.js mock factories with vitest spies for isolated tests |

## Design
- Single implementation module `discord.ts` with typed factory functions `createMockUser`, `createMockMember`, `createMockGuild`, `createMockChannel`, `createMockMessage`, `createMockInteraction`, `createMockClient`, `createMockVoiceState`, and collection helpers.
- Typed mock aliases (`MockUser`, `MockGuildMember`, `MockGuild`, `MockTextChannel`, `MockMessage`) intersect discord.js types with `vi.fn()` spies for behavior verification.
- `MockCollection` extends `Map` with spied collection methods and `toMockCollection` normalizes Maps, Arrays, or existing collections.
- ESLint-ignored directory; mock files do not need to pass source lint. Spies come from Vitest `vi`.
- Patterns: Factory (typed `createMock*` factory functions), Test Double (mock aliases with `vi.fn()` spies verifying behavior).

## Flow
1. Test imports the needed factory from `tests/mocks/discord.ts`.
2. Factory is invoked with optional overrides for IDs, nested objects, and method return values.
3. Factory builds nested graph via sibling factories and replaces methods with `vi.fn()` stubs, using `MockCollection` for cache-like properties.
4. Mock is passed to the system under test such as a command executor or event handler.
5. Vitest records calls for assertions on counts, arguments, and return values; `tests/setup.ts` restores and clears mocks after each test.

## Integration
- Consumed by `tests/**/*.test.ts` suites, approximately 162 files configured in `tests/setup.ts`.
- Mirrors discord.js v14 surfaces for User, GuildMember, Guild, TextChannel, Message, Interaction, Client, and VoiceState.
- No production code depends on this directory; purely test-time constructs with isolated temporary databases managed by setup.
