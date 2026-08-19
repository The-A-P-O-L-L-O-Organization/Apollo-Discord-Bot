# Security Hardening Deepwork Plan

## Goal
Address the 6 identified security gaps in the Apollo Discord Bot codebase:
1. **Duplicated access control** - "bot owner only" check copy-pasted across 7+ files
2. **In-memory security state** - raid detection and spam tracking don't survive restarts or scale horizontally
3. **Basic automod filters** - regex-based, bypassable
4. **Sensitive data exposure** - API keys posted in Discord messages
5. **Soft plugin sandboxing** - process-level limits, not true isolation
6. **No encryption at rest** - SQLite plain file, JSON blobs

## Current Understanding

### Files with duplicated owner check (7+ files):
- `src/plugins/admin/commands/migrate.js:25-31`
- `src/plugins/admin/commands/plugin.js:112-123`
- `src/plugins/admin/commands/queue.js:13-19`
- `src/plugins/admin/commands/system.js:26-32`
- `src/plugins/moderation/commands/blacklist.js:299-310`
- `src/plugins/utility/commands/apolloActions.js:14-24`
- `src/plugins/interlink/commands/interlink.js:9-12` (local `isOwner()` helper)

### In-memory state issues:
- `src/utils/raidDetection.js:8-10` - `raidState` Map (per-process)
- `src/utils/automod.js:8-10` - `spamTracker` Map (per-process)
- `src/plugins/interlink/rateLimit.js:1-2` - In-memory fixed-window rate limiter, per-instance only

### Automod filter weaknesses:
- `src/utils/automod.js:144-159` - Simple regex for links/invites
- `src/utils/automod.js:87-137` - Static word-boundary regex for banned words

### Sensitive data exposure:
- `src/plugins/interlink/commands/interlink.js:320-323` - Raw API key in followUp message

### Plugin sandboxing:
- `src/core/worker/workerHost.js:18-48` - Process-level resource limits only

### No encryption at rest:
- `src/db/adapter.js:27-44` - Raw JSON blobs in SQLite

## Phased Implementation Plan

### Phase 1: Centralized Access Control (Foundation)
**Goal**: Create a shared middleware/decorator for owner-only commands
**Files to create/modify**:
- `src/utils/accessControl.js` - New centralized access control utility
- Update 7 command files to use the shared utility
- Add tests for the new utility

**Gate**: Oracle review of centralized access control design and implementation

### Phase 2: Redis-Backed Security State (Raid Detection & Spam Tracking)
**Goal**: Make raid detection and spam tracking survive restarts and scale horizontally
**Files to create/modify**:
- `src/utils/raidDetection.js` - Add Redis-backed variants, wire them in
- `src/utils/automod.js` - Ensure Redis-backed spam tracking is used when Redis available
- `src/plugins/interlink/rateLimit.js` - Add Redis-backed distributed rate limiter
- Update config to enable Redis-backed modes by default when Redis configured

**Gate**: Oracle review of distributed state architecture

### Phase 3: Hardened Automod Filters
**Goal**: Improve regex-based filters to resist common bypasses
**Files to modify**:
- `src/utils/automod.js` - Enhance link/invite detection, banned word matching
- Add URL normalization, zero-width character handling, obfuscation detection

**Gate**: Oracle review of filter improvements and bypass resistance

### Phase 4: Secure API Key Handling
**Goal**: Remove raw API key exposure in Discord messages
**Files to modify**:
- `src/plugins/interlink/commands/interlink.js` - Send API key via DM or one-time secret store
- `src/plugins/interlink/auth.js` - Add key retrieval mechanism

**Gate**: Oracle review of secret handling flow

### Phase 5: Plugin Sandboxing Hardening
**Goal**: Document current limitations and add defense-in-depth
**Files to modify**:
- `src/core/worker/workerHost.js` - Add capability validation, improve logging
- `src/core/worker/pluginManifest.js` - Enhance capability manifest
- Document sandbox limitations clearly

**Gate**: Oracle review of sandboxing improvements

### Phase 6: Encryption at Rest
**Goal**: Add column-level encryption for sensitive data
**Files to create/modify**:
- `src/utils/encryption.js` - New encryption utility (AES-GCM)
- `src/db/adapter.js` - Integrate encryption for sensitive stores
- Key management via environment variable

**Gate**: Oracle review of encryption design and key management

## Dependencies
- Phase 1 is independent, can start immediately
- Phase 2 depends on Redis infrastructure (already present in config)
- Phase 3 is independent
- Phase 4 depends on Phase 1 (for owner check in interlink commands)
- Phase 5 is independent
- Phase 6 depends on Phase 1 (for key management access control)

## Verification Strategy
Each phase will have:
- Unit tests for new utilities
- Integration tests for cross-component behavior
- Manual verification steps documented
- Oracle review gate before proceeding

## Risk Assessment
- **High**: Phase 2 (distributed state) - complex, affects reliability
- **High**: Phase 6 (encryption) - data migration risk, key management
- **Medium**: Phase 1 (access control) - widespread changes, but straightforward
- **Medium**: Phase 4 (API keys) - UX change, but security-critical
- **Low**: Phase 3 (filters) - incremental improvements
- **Low**: Phase 5 (sandboxing) - documentation and defense-in-depth

## Next Steps
1. Start Phase 1: Create centralized access control utility
2. Write tests first (TDD)
3. Refactor all 7 command files
4. Run full test suite
5. Request Oracle gate review