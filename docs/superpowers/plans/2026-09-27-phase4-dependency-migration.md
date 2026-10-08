# Phase 4: Dependency Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the three P0 dependency migrations: remove @tensorflow/tfjs-node (if unused), pin Node.js 22 LTS (already done in Phase 1), and prepare for discord.js v15 migration.

**Architecture:** Each dependency task is independent but discord.js v15 prep requires audit of entire codebase. Node 22 pinning was completed in Phase 1.

**Tech Stack:** Node.js 22+, TypeScript, pnpm, discord.js v14 (preparing for v15)

**Spec:** This plan addresses Technical Debt Assessment items from Librarian P0:
- **@tensorflow/tfjs-node** — Unmaintained, 500MB native, CUDA 11.2 → Audit usage → Remove if unused
- **better-sqlite3 v13** — Requires Node≥22 → Pin Node 22 LTS (DONE in Phase 1)
- **discord.js v14→v15** — Major API breaks imminent → Audit usage, prepare migration branch

## Global Constraints

- **Node.js:** ≥22 (Iron LTS) — enforced in `package.json` engines, `.nvmrc`, Docker, CI
- **TypeScript:** Strict mode, ESM only
- **Lint:** `pnpm lint`
- **Test:** `pnpm test`
- **No emojis** in source or docs
- **No code comments** unless explicitly requested

## Review Focus

| Input/Condition | Expected Behavior | Test Location |
|-----------------|-------------------|---------------|
| `@tensorflow/tfjs-node` not in deps | `pnpm install` succeeds, no native build | `pnpm install` verification |
| Code uses discord.js v14 APIs | All imports/usages catalogued for migration | `docs/discordjs-v15-audit.md` |
| Migration branch exists | `git branch discordjs-v15-migration` created | Git verification |

---

### Task 1: Audit and Remove @tensorflow/tfjs-node

**Files:**
- Audit: Search codebase for tfjs usage
- Modify: `package.json` (remove if unused)
- Modify: `pnpm-workspace.yaml` (remove from allowBuilds)
- Test: Verify build and tests pass

**Interfaces:**
- Consumes: Current dependency tree
- Produces: Clean dependency tree

- [ ] **Step 1: Audit actual usage**

```bash
# Search for any tfjs imports or usage
grep -r "@tensorflow/tfjs-node" src/ || echo "NOT USED IN SOURCE"
grep -r "tfjs" src/ || echo "NO TFJS IMPORTS"
grep -r "tensorflow" src/ || echo "NO TENSORFLOW IMPORTS"
grep -r "@tensorflow" package.json pnpm-lock.yaml || echo "NOT IN DEPS"
```

- [ ] **Step 2: If unused, remove from package.json**

```bash
pnpm remove @tensorflow/tfjs-node
```

- [ ] **Step 3: Remove from pnpm-workspace.yaml allowBuilds**

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - better-sqlite3
  - msgpackr-extract
  - core-js
  - '@swc/core'
  - '@bufbuild/buf'
  # REMOVED: - '@tensorflow/tfjs-node'
```

- [ ] **Step 4: Verify clean install**

```bash
pnpm install
# Expected: Success, no tfjs-node in node_modules
du -sh node_modules/@tensorflow 2>/dev/null || echo "tfjs-node removed"
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
# Expected: No new failures
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: remove unused @tensorflow/tfjs-node dependency"
```

---

### Task 2: Verify Node.js 22 LTS Pinning (from Phase 1)

**Files:** Verification only

- [ ] **Step 1: Verify all configs have Node 22**

```bash
# Check package.json
grep -A2 '"engines"' package.json

# Check .nvmrc
cat .nvmrc

# Check Dockerfiles
grep "FROM node:" Dockerfile Dockerfile.prod

# Check CI
grep "node-version" .github/workflows/ci.yml
```

- [ ] **Step 2: Test on Node 22**

```bash
fnm install 22 && fnm use 22 && pnpm install && pnpm test && pnpm lint
# Expected: All pass
```

- [ ] **Step 3: Document in README if needed**

```markdown
# README.md additions
## Requirements
- Node.js 22 LTS (Iron) or later
- pnpm 9+
- Redis 7+ (Cluster/Sentinel for HA)
- PostgreSQL 15+ or SQLite
```

- [ ] **Step 4: Commit if any changes**

```bash
git add README.md
git commit -m "docs: document Node.js 22 LTS requirement"
```

---

### Task 3: Audit discord.js v14 Usage for v15 Migration Prep

**Files:**
- Create: `docs/discordjs-v15-audit.md` (comprehensive audit document)
- Create: `scripts/audit-discordjs.mjs` (automated audit script)
- Create: `discordjs-v15-migration` branch (preparation)

**Interfaces:**
- Consumes: Entire codebase using discord.js
- Produces: Migration audit document and preparation branch

- [ ] **Step 1: Create automated audit script**

```javascript
// scripts/audit-discordjs.mjs - NEW FILE
import { glob } from 'glob'
import { readFileSync } from 'fs'

const files = await glob('src/**/*.ts')
const patterns = {
  // v14 APIs that change in v15
  'Intents.FLAGS': /Intents\.FLAGS/g,
  'GatewayIntentBits': /GatewayIntentBits\./g,
  'MessageEmbed': /MessageEmbed/g,
  'EmbedBuilder': /EmbedBuilder/g,
  'Client constructor': /new Client\(/g,
  'Client.login': /\.login\(/g,
  'Interaction.reply': /\.reply\(/g,
  'Interaction.deferReply': /\.deferReply\(/g,
  'Interaction.editReply': /\.editReply\(/g,
  'Interaction.followUp': /\.followUp\(/g,
  'CommandInteraction': /CommandInteraction/g,
  'ButtonInteraction': /ButtonInteraction/g,
  'SelectMenuInteraction': /SelectMenuInteraction/g,
  'ModalSubmitInteraction': /ModalSubmitInteraction/g,
  'AutocompleteInteraction': /AutocompleteInteraction/g,
  'Permissions': /Permissions\./g,
  'PermissionFlagsBits': /PermissionFlagsBits\./g,
  'ChannelType': /ChannelType\./g,
  'ComponentType': /ComponentType\./g,
  'ButtonStyle': /ButtonStyle\./g,
  'TextInputStyle': /TextInputStyle\./g,
  'ApplicationCommandType': /ApplicationCommandType\./g,
  'ApplicationCommandOptionType': /ApplicationCommandOptionType\./g,
  'REST': /new REST\(/g,
  'Routes': /Routes\./g,
  'Events': /Events\./g,
  'Partials': /Partials\./g,
  'Collection': /Collection</g,
  'Snowflake': /Snowflake/g,
}

const results = {}
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  for (const [name, regex] of Object.entries(patterns)) {
    const matches = content.match(regex)
    if (matches) {
      if (!results[name]) results[name] = []
      results[name].push({ file, count: matches.length })
    }
  }
}

console.log('# discord.js v14 API Usage Audit')
console.log('')
for (const [api, occurrences] of Object.entries(results)) {
  console.log(`## ${api}`)
  console.log(`Total occurrences: ${occurrences.reduce((sum, o) => sum + o.count, 0)}`)
  console.log('')
  for (const occ of occurrences) {
    console.log(`- ${occ.file}: ${occ.count}`)
  }
  console.log('')
}
```

- [ ] **Step 2: Run audit script**

```bash
node scripts/audit-discordjs.mjs > docs/discordjs-v15-audit.md
```

- [ ] **Step 3: Review audit document and categorize**

```markdown
# docs/discordjs-v15-audit.md - MANUAL REVIEW NEEDED

## Breaking Changes in v15 (from discord.js roadmap)

### 1. Client Initialization
- **Current**: `new Client({ intents: [GatewayIntentBits.Guilds] })`
- **v15**: Likely unchanged but verify

### 2. Intents
- **Current**: `GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages`
- **v15**: Enum values may change (string→number only)

### 3. Interactions
- **Current**: `interaction.reply()`, `interaction.deferReply()`
- **v15**: May require ephemeral flag changes

### 4. EmbedBuilder
- **Current**: `new EmbedBuilder().setTitle()`
- **v15**: Already migrated in v14, should be stable

### 5. Permissions
- **Current**: `Permissions.bitfield`, `PermissionFlagsBits`
- **v15**: BigInt-based permissions (already in v14)

### 6. REST API
- **Current**: `new REST({ version: '10' }).setToken()`
- **v15**: API version 11

## Files Requiring Changes (from audit)

### High Priority (Core Infrastructure)
- [ ] `src/index.ts` - Client initialization
- [ ] `src/gateway/leader.ts` - Gateway events
- [ ] `src/queue/jobs/processCommand.ts` - Interaction handling

### Medium Priority (Plugins)
- [ ] `src/plugins/*/commands/*.ts` - Slash command handlers
- [ ] `src/plugins/*/events/*.ts` - Event handlers

### Low Priority (Utilities)
- [ ] `src/utils/*.ts` - Helper functions
```

- [ ] **Step 4: Create migration preparation branch**

```bash
git checkout -b discordjs-v15-migration
# This branch will track v15 pre-releases and prepare migration
git push origin discordjs-v15-migration
```

- [ ] **Step 5: Add discord.js v15 tracking to CI**

```yaml
# .github/workflows/discordjs-v15-tracking.yml - NEW FILE
name: Track discord.js v15
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  workflow_dispatch:

jobs:
  check-v15:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install
      - run: |
          LATEST=$(npm view discord.js@next version --json)
          CURRENT=$(node -p "require('./package.json').dependencies['discord.js']")
          echo "Current: $CURRENT, Latest v15 pre: $LATEST"
          if [[ "$LATEST" == 15* ]]; then
            echo "V15_PRE_RELEASE=true" >> $GITHUB_ENV
      - name: Create issue if v15 pre-release
        if: env.V15_PRE_RELEASE == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'discord.js v15 pre-release available - plan migration',
              body: 'A new discord.js v15 pre-release is available. Review breaking changes and plan migration.',
              labels: ['dependencies', 'discord.js']
            })
```

- [ ] **Step 6: Commit audit and tracking**

```bash
git add scripts/audit-discordjs.mjs docs/discordjs-v15-audit.md .github/workflows/discordjs-v15-tracking.yml
git commit -m "chore: add discord.js v15 migration audit and tracking"
```

---

### Task 4: Prepare for Actual v15 Migration (When Stable)

**Files:** Documentation and planning only

- [ ] **Step 1: Create migration checklist**

```markdown
# docs/discordjs-v15-migration-checklist.md

## Pre-Migration
- [ ] discord.js v15.0.0 stable released
- [ ] All plugins tested on v15 pre-release in migration branch
- [ ] Breaking changes documented per plugin
- [ ] Migration branch up to date with main

## Migration Steps
- [ ] Update discord.js to v15.0.0 in package.json
- [ ] Update @discordjs/rest, @discordjs/collection, discord-api-types
- [ ] Fix Client initialization (if changed)
- [ ] Fix Intents (GatewayIntentBits enum changes)
- [ ] Fix Interaction replies (ephemeral handling)
- [ ] Fix REST API version (v10→v11)
- [ ] Fix Permission handling (BigInt throughout)
- [ ] Fix Channel/Component/Button types
- [ ] Run full test suite
- [ ] Fix all TypeScript errors
- [ ] Manual smoke test in dev guild

## Post-Migration
- [ ] Deploy to staging
- [ ] Monitor for 24h
- [ ] Deploy to production
- [ ] Update migration branch
- [ ] Close tracking issue
```

- [ ] **Step 2: Document known v15 breaking changes (from discord.js repo)**

```markdown
# Known v15 Breaking Changes (from discord.js GitHub)

1. **Discord API v10 → v11** - REST routes updated
2. **Enum handling** - String enums removed, numbers only
3. **Intents** - GatewayIntentBits values may shift
4. **Client constructor** - Options shape may change
5. **Interaction responses** - Ephemeral default may change
6. **Component interactions** - Custom ID limits may change
7. **Thread handling** - Archive duration changes
8. **Voice API** - Potential breaking changes

Source: https://github.com/discordjs/discord.js/milestone/v15
```

- [ ] **Step 3: Commit migration preparation**

```bash
git add docs/discordjs-v15-migration-checklist.md
git commit -m "docs: add discord.js v15 migration checklist"
```

---

## Execution Order

```
Task 1: Audit & remove tfjs-node (independent, 15 min)
Task 2: Verify Node 22 pinning (independent, 10 min)
Task 3: Audit discord.js usage (independent, 30 min)
Task 4: Migration prep docs (depends on Task 3, 15 min)
```

**Total estimated time:** ~1 hour

## Post-Phase Verification

```bash
# Verify tfjs-node removed
pnpm list @tensorflow/tfjs-node || echo "REMOVED"

# Verify Node 22
node --version | grep "v22"

# Verify audit exists
cat docs/discordjs-v15-audit.md | head -50

# Full test
pnpm test
pnpm lint
```

---

## Notes

- **tfjs-node removal**: Only do if audit confirms unused. If used by any plugin (e.g., automod NSFW detection), evaluate alternatives:
  - `onnxruntime-node` — lighter, actively maintained
  - `transformers.js` — WASM-based, no native build
  - Keep tfjs-node but document as known risk

- **discord.js v15**: Do NOT migrate until v15.0.0 stable. Pre-releases are for testing only. The audit and tracking workflow prepare us for when stable releases.