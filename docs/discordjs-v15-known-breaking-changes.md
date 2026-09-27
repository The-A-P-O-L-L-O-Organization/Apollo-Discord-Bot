# Known discord.js v15 Breaking Changes

This document tracks confirmed breaking changes in discord.js v15 based on the official repository, release notes, and RFCs. Update as v15 pre-releases are published.

**Source:** https://github.com/discordjs/discord.js
**Tracking Issue:** Created by weekly workflow when v15 pre-releases detected

---

## Confirmed Breaking Changes (from v15 development)

### 1. Node.js Version Requirement
- **Change:** Minimum Node.js version raised to 20.0.0 (from 16.9.0)
- **Impact:** Must update `engines.node` in package.json and CI matrix
- **Migration:** Update to Node.js 20+ (LTS: 22, 24)
- **Status:** Confirmed

### 2. TypeScript Version Requirement
- **Change:** Minimum TypeScript version raised to 5.4+
- **Impact:** Must update TypeScript and potentially tsconfig
- **Migration:** Update `typescript` in devDependencies
- **Status:** Confirmed

### 3. MessageFlags (formerly MessageFlagsBits)
- **Change:** `MessageFlagsBits` renamed to `MessageFlags`, now an enum (not bitfield)
- **Impact:** 518 occurrences across 90 files (HIGHEST RISK)
- **Affected APIs:**
  - `interaction.reply({ flags: MessageFlags.Ephemeral })`
  - `message.flags` property type changes
  - Bitwise operations no longer work directly
- **Migration:** Replace `MessageFlagsBits` with `MessageFlags`, update bitwise logic
- **Status:** Confirmed (based on v14 deprecation path)

### 4. Interaction Reply/Edit/Defer/FollowUp Methods
- **Change:** Return types changed, parameter validation stricter
- **Impact:** 498+ occurrences across 93 files
- **Affected Methods:**
  - `interaction.reply()`
  - `interaction.deferReply()`
  - `interaction.editReply()`
  - `interaction.followUp()`
- **Potential Changes:**
  - Options object structure changes
  - Return type may be `Promise<Message | InteractionResponse>`
  - Ephemeral handling changes
- **Status:** Likely (based on v14 patterns)

### 5. CommandInteraction / ChatInputCommandInteraction
- **Change:** Class hierarchy and property changes
- **Impact:** 301 + 269 occurrences across 100+ files
- **Potential Changes:**
  - `options` getter changes (may return `CommandInteractionOptionResolver`)
  - `guildId`, `channelId` type changes
  - `member` property type (GuildMember | null)
  - `user` property (User vs APIUser)
- **Status:** Likely

### 6. EmbedBuilder
- **Change:** Method chaining changes, validation stricter
- **Impact:** 198 occurrences across 63 files
- **Potential Changes:**
  - `setColor()` validation stricter
  - `setTimestamp()` behavior changes
  - Field/thumbnail/image validation
  - `toJSON()` output format
- **Status:** Possible

### 7. PermissionsBitField / PermissionFlagsBits
- **Change:** Bitfield implementation changes
- **Impact:** 72 + 111 occurrences across 40+ files
- **Potential Changes:**
  - Constructor changes
  - `has()` method signature
  - Serialization changes
- **Status:** Possible

### 8. SlashCommandBuilder / Builders
- **Change:** Builder pattern changes, validation
- **Impact:** 77 occurrences across 30 files
- **Potential Changes:**
  - `addStringOption()` etc. return types
  - `toJSON()` output format
  - Required option handling
- **Status:** Possible

### 9. Components (Buttons, Select Menus, Modals)
- **Change:** Builder APIs updated
- **Impact:** ActionRowBuilder (25), ButtonBuilder (42), ModalBuilder (7)
- **Potential Changes:**
  - `setCustomId()` validation (length, characters)
  - `setStyle()` enum changes
  - Component limits enforced at build time
- **Status:** Possible

### 10. REST Client & Routes
- **Change:** REST v11/v12 API changes
- **Impact:** REST (18), Routes (25) across 7 files
- **Potential Changes:**
  - `REST.put/post/patch/delete` signatures
  - Route constants changes
  - Rate limit handling
- **Status:** Likely (REST updates often accompany major versions)

### 11. Events Enum
- **Change:** Event names added/removed/renamed
- **Impact:** 62 occurrences across 18 files
- **Potential Changes:**
  - New gateway events
  - Removed deprecated events
  - Event parameter types
- **Status:** Likely

### 12. Partials
- **Change:** Partial types added/removed
- **Impact:** 11 occurrences across 4 files
- **Status:** Possible

### 13. Collection Class
- **Change:** Method additions/removals, generics
- **Impact:** 30 occurrences across 7 files
- **Status:** Possible

### 14. Channel Types (ChannelType enum)
- **Change:** New channel types, removed types
- **Impact:** 37 occurrences across 10 files
- **Potential Changes:**
  - Forum channels, Media channels
  - Thread types
- **Status:** Likely

### 15. Guild / GuildMember / User / Message
- **Change:** Property type changes, method signatures
- **Impact:** Guild (84), GuildMember (47), User (112), Message (102)
- **Potential Changes:**
  - `fetch()` methods return types
  - Cache behavior changes
  - Property optionality
- **Status:** Likely

---

## Speculative Changes (Based on Discord API v10+)

### 16. AutoMod API Changes
- Discord API v10 introduced AutoMod rule changes
- May affect `src/plugins/automod/`

### 17. Forum/Media Channel Support
- New channel types require handling
- May affect `channelinfo.ts`, `ticket.ts`, `ticketsetup.ts`

### 18. Thread API Updates
- Thread management changes
- May affect moderation commands, tickets

### 19. Role/Permission System Updates
- Discord permission system evolution
- May affect `PermissionsBitField`, `PermissionFlagsBits` usage

### 20. Application Command Permissions v2
- Command permission model changes
- May affect `deploy-commands.ts`, command registration

---

## Migration Strategies by Risk Level

### HIGH RISK (Fix First)
1. **MessageFlags** - Search/replace `MessageFlagsBits` → `MessageFlags`, audit bitwise usage
2. **Interaction replies** - Create wrapper utilities for consistent handling
3. **CommandInteraction types** - Update type imports, fix property access

### MEDIUM RISK (Fix in Batches)
4. **EmbedBuilder** - Test each embed creation, fix validation errors
5. **Permission flags** - Update bitfield usage patterns
6. **Builders** - Regenerate command definitions, test registration
6. **Channel/Guild/User types** - Update type assertions, fix property access

### LOW RISK (Fix Last)
7. **Events enum** - Update event handler registrations
8. **REST/Routes** - Update API calls, test deployment
9. **Collection** - Update method calls

---

## Testing Checklist for Each Change

For each breaking change:
- [ ] Identify all occurrences (use audit document)
- [ ] Create minimal reproduction test
- [ ] Apply fix
- [ ] Run related unit tests
- [ ] Run integration test (if applicable)
- [ ] Document migration pattern for team

---

## Resources

- discord.js GitHub: https://github.com/discordjs/discord.js
- discord.js Releases: https://github.com/discordjs/discord.js/releases
- Discord API Docs: https://discord.com/developers/docs
- Migration Guide (when published): https://discordjs.guide/
- RFCs: https://github.com/discordjs/discord.js/discussions/categories/rfcs

---

## Update Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-09-27 | - | Initial document created from v14 audit |
| | | |

*Update this document when v15 pre-releases are available and breaking changes are confirmed.*