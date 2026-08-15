# tests/mocks/

## Responsibility
Provides mock implementations of Discord.js objects for unit and integration testing, enabling isolated testing of bot logic without external API calls.

## Design
- Factory pattern: Functions like `createMockUser`, `createMockMember`, etc., generate configurable mock objects.
- MockCollection class extends Map with Vitest vi.fn spies on collection methods (get, filter, find, etc.) to track interactions.
- toMockCollection utility converts Maps, Arrays, or existing MockCollections to MockCollection instances.
- Each mock factory returns plain objects with properties settable via options and vi.fn stubbed methods (e.g., send, reply, delete) for behavior verification.

## Flow
1. Test code imports desired mock factory from this module.
2. Factory function invoked with optional overrides to shape the mock (e.g., IDs, timestamps, specific method return values).
3. Factory constructs a mock object:
   - Primitives and nested objects (user, guild, channel) are created via other factories or defaults.
   - Methods are replaced with vi.fn() spies, optionally configured with mockReturnValue or mockResolvedValue.
   - Collection-like properties (roles.cache, channels.cache) are MockCollection instances to spy on collection interactions.
4. The returned mock is passed to the system under test (e.g., command executor, event handler).
5. During execution, calls to mock methods are recorded by Vitest, allowing assertions on call counts, arguments, and return values.
6. After test execution, spies can be inspected or reset via Vitest utilities.

## Integration
- Consumed by test files across the codebase (e.g., src/plugins/*/tests/*.test.js).
- Depends on Vitest (`vi`) for spy creation.
- Mirrors Discord.js API surfaces: User, GuildMember, Guild, TextChannel, Message, Interaction (slash command), Client, VoiceState, role collections.
- No external runtime dependencies; purely test‑time constructs.