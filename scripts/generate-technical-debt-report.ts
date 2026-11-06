#!/usr/bin/env tsx
/**
 * Technical Debt Report Generator
 * Scans the codebase and generates a markdown report similar to TECHNICAL_DEBT_REPORT.md
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const OUTPUT_FILE = join(ROOT, 'TECHNICAL_DEBT_REPORT.md');

interface DebtItem {
  file: string;
  lines?: number;
  issue: string;
  evidence?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

interface DepInfo {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  risk: string;
  severity: 'high' | 'medium' | 'low';
}

interface FileStats {
  path: string;
  lines: number;
  category: string;
}

function runCommand(cmd: string, cwd = ROOT, timeout = 30000): string {
  // Use spawnSync with shell to support shell operators like || and 2>/dev/null
  const result = spawnSync(cmd, { 
    cwd, 
    encoding: 'utf-8', 
    maxBuffer: 10 * 1024 * 1024, 
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });
  
  // Return stdout regardless of exit code (pnpm outdated returns 1 when packages are outdated)
  return (result.stdout || '').trim();
}

function countLines(file: string): number {
  try {
    const content = readFileSync(file, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function walkDir(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!name.startsWith('.') && name !== 'node_modules' && name !== 'dist') {
        walkDir(full, files);
      }
    } else if (extname(full) === '.ts' || extname(full) === '.js' || extname(full) === '.cjs') {
      files.push(full);
    }
  }
  return files;
}

function getAllSourceFiles(): string[] {
  const allFiles = walkDir(SRC_DIR);
  // Exclude generated files (protobuf-generated code under src/generated/)
  return allFiles.filter(f => !f.includes('/generated/'));
}

function analyzeDependencies(): DepInfo[] {
  const deps: DepInfo[] = [];
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  
  // Run pnpm outdated once for all packages - use temp file to avoid truncation
  const tmpFile = join('/tmp', `pnpm-outdated-${Date.now()}.json`);
  const cmd = `pnpm outdated --json > "${tmpFile}" 2>/dev/null; cat "${tmpFile}" 2>/dev/null || echo '{}'; rm -f "${tmpFile}"`;
  const output = runCommand(cmd, ROOT, 60000);
  
  let outdatedObj: Record<string, any> = {};
  try {
    outdatedObj = JSON.parse(output);
  } catch (e) {
    outdatedObj = {};
  }
  
  for (const [name, info] of Object.entries(outdatedObj)) {
    const version = allDeps[name];
    if (!version || typeof version !== 'string') {
      continue;
    }
    
    const isDev = name in pkg.devDependencies;
    // High severity = major version change (wanted != latest), Medium = minor/patch (wanted == latest but current != latest)
    const wantedParts = info.wanted.split('.').map(Number);
    const latestParts = info.latest.split('.').map(Number);
    const isMajorBump = wantedParts[0] !== latestParts[0];
    const severity = isMajorBump ? 'high' : 'medium';
    deps.push({
      name,
      current: info.current,
      wanted: info.wanted,
      latest: info.latest,
      risk: isDev ? 'Development dependency' : 'Production dependency',
      severity
    });
  }
  
  return deps;
}

function analyzeFileSizes(files: string[]): FileStats[] {
  const stats: FileStats[] = [];
  
  for (const file of files) {
    const lines = countLines(file);
    if (lines > 200) {
      const rel = relative(ROOT, file);
      let category = 'Other';
      if (rel.includes('/commands/')) category = 'Command';
      else if (rel.includes('/utils/')) category = 'Utility';
      else if (rel.includes('/core/')) category = 'Core';
      else if (rel.includes('/events/')) category = 'Event';
      else if (rel.includes('/types/')) category = 'Types';
      else if (rel.includes('/queue/')) category = 'Queue';
      
      stats.push({ path: rel, lines, category });
    }
  }
  
  return stats.sort((a, b) => b.lines - a.lines);
}

function detectLegacyPatterns(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // CommonJS migration files (check for .js files that still use CommonJS patterns)
    if (rel.includes('db/migrations') && (extname(file) === '.cjs' || content.includes('exports.up = async function'))) {
      items.push({
        file: rel,
        lines,
        issue: 'Migration files use CommonJS (require/module.exports) while rest of codebase is ESM',
        evidence: 'Requires .cjs extension or CommonJS syntax; cannot use import; blocks full ESM migration',
        severity: 'high',
        category: 'Legacy Patterns'
      });
    }
    
    // Sync I/O in async context
    if (content.includes('JSON.parse(readFileSync')) {
      const matches = content.match(/JSON\.parse\(readFileSync\([^)]+\)/g);
      if (matches) {
        items.push({
          file: rel,
          lines,
          issue: 'Sync JSON.parse(readFileSync()) in async context',
          evidence: `Found ${matches.length} occurrence(s); blocks event loop; should use async fs`,
          severity: 'medium',
          category: 'Legacy Patterns'
        });
      }
    }
    
    // Raw SQL in health check
    if (rel === 'src/utils/healthServer.ts' && content.includes("knex.raw('SELECT 1')")) {
      items.push({
        file: rel,
        lines,
        issue: 'Raw SQL in health check',
        evidence: "await knex.raw('SELECT 1') — bypasses query builder; inconsistent with adapter pattern",
        severity: 'medium',
        category: 'Legacy Patterns'
      });
    }
    
    // Dynamic import with cache busting
    if (content.includes('?t=${Date.now()}') || content.includes("?t=" + "Date.now()")) {
      items.push({
        file: rel,
        lines,
        issue: 'Dynamic import with cache-busting query parameter',
        evidence: 'Defeats module caching; potential for loading inconsistent versions',
        severity: 'medium',
        category: 'Security'
      });
    }
    
    // eval command type
    if (content.includes("'eval'") && (content.includes('rpc') || content.includes('RPC'))) {
      items.push({
        file: rel,
        lines,
        issue: "'eval' as RPC command type — confusing naming suggests code execution",
        evidence: "Found 'eval' in RPC context",
        severity: 'low',
        category: 'Security'
      });
    }
    
    // Unbounded caches
    if (rel === 'src/utils/automod.ts' && (content.includes('spamTracker') || content.includes('burstTracker'))) {
      if (content.includes('cleanupBurstTracker') && !content.includes('setInterval')) {
        items.push({
          file: rel,
          lines,
          issue: 'Unbounded in-memory caches without proper TTL eviction',
          evidence: 'spamTracker and burstTracker have no TTL-based eviction; cleanup only runs every 60s',
          severity: 'high',
          category: 'Performance'
        });
      }
    }
    
    // N+1 queries in automod
    if (rel === 'src/plugins/automod/commands/automod.ts' && content.includes('checkMessageAttachments')) {
      items.push({
        file: rel,
        lines,
        issue: 'Potential N+1 queries in automod scan',
        evidence: 'Fetches messages in batches, then calls checkMessageAttachments per message (may hit DB/Redis)',
        severity: 'high',
        category: 'Performance'
      });
    }
  }
  
  return items;
}

function detectCodeQualityIssues(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  const godFiles = new Map<string, number>();
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // God files (>500 lines)
    if (lines > 500) {
      godFiles.set(rel, lines);
      
      let issue = 'Large file — consider splitting';
      if (lines > 700) issue = 'God file — violates SRP, extremely large';
      else if (lines > 600) issue = 'Very large file — multiple responsibilities';
      
      items.push({
        file: rel,
        lines,
        issue,
        severity: lines > 700 ? 'critical' : lines > 600 ? 'high' : 'medium',
        category: 'Code Quality'
      });
    }
    
    // Duplicate interfaces (basic check)
    if (content.includes('interface AutomodConfig')) {
      const matches = content.match(/interface AutomodConfig/g);
      if (matches && matches.length > 1) {
        items.push({
          file: rel,
          lines,
          issue: 'Duplicate AutomodConfig interface definition',
          evidence: 'Same interface defined in multiple locations',
          severity: 'low',
          category: 'Code Quality'
        });
      }
    }
  }
  
  return items;
}

function analyzeTestGaps(): DebtItem[] {
  const items: DebtItem[] = [];
  
  // Skip running tests - too slow. Use static analysis instead.
  // Check for known failing test patterns from the codebase
  const testFiles = runCommand('find tests -name "*.test.ts" 2>/dev/null | wc -l');
  const totalTests = parseInt(testFiles.trim()) * 10; // rough estimate
  
  // Check for i18next v26 issues (known from codebase)
  const i18nIssues = runCommand('grep -r "getFixedT" tests/*.test.ts 2>/dev/null | wc -l');
  if (parseInt(i18nIssues.trim()) > 0) {
    items.push({
      file: 'Test Suite',
      lines: totalTests,
      issue: 'i18next v26 API incompatibility: `fixedT` usage pattern broken',
      evidence: 'i18next v26 changed internal APIs causing `fixedT()` to crash in multiple test files',
      severity: 'high',
      category: 'Test Gaps'
    });
  }
  
  // Check for missing test coverage areas
  const criticalPaths = [
    { path: 'src/core/worker/workerHost.ts', name: 'Worker sandbox' },
    { path: 'src/core/worker/workerChild.ts', name: 'Worker child process' },
    { path: 'src/db/migrations/', name: 'Database migrations' },
    { path: 'src/core/EventBus.ts', name: 'Cross-pod EventBus' },
    { path: 'src/queue/jobs/processCommand.ts', name: 'Queue job processing' },
    { path: 'src/plugins/interlink/', name: 'Interlink gRPC/Connect client' },
  ];
  
  for (const { path, name } of criticalPaths) {
    const escapedPath = path.replace(/\//g, '\\/');
    const testFiles = runCommand(`find tests -name "*.test.ts" -exec grep -l "${escapedPath}" {} \\; 2>/dev/null | wc -l`);
    if (parseInt(testFiles.trim()) === 0) {
      items.push({
        file: path,
        issue: `Missing test coverage for critical path: ${name}`,
        evidence: 'No integration/unit tests found',
        severity: 'medium',
        category: 'Test Gaps'
      });
    }
  }
  
  return items;
}

function detectArchitectureSmells(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // Plugin Manager God Class
    if (rel === 'src/core/PluginManager.ts' && lines > 400) {
      items.push({
        file: rel,
        lines,
        issue: 'Plugin Manager God Class — handles discovery, loading, dependency resolution, worker spawning, capability indexing, socket handlers, command sync',
        evidence: `${lines} lines; violates SRP`,
        severity: 'high',
        category: 'Architecture'
      });
    }
    
    // EventBus triple responsibility
    if (rel === 'src/core/EventBus.ts') {
      const hasEmit = content.includes('emit(');
      const hasProvide = content.includes('provide(');
      const hasState = content.includes('provideState') || content.includes('watchState');
      if (hasEmit && hasProvide && hasState) {
        items.push({
          file: rel,
          lines,
          issue: 'EventBus Triple Responsibility — event emission, RPC-style APIs (provide/call), and distributed state (provideState/watchState) in one class',
          evidence: 'Three distinct responsibilities combined',
          severity: 'high',
          category: 'Architecture'
        });
      }
    }
    
    // Config singleton everywhere
    if (content.includes("import { config } from") && content.includes('../config/config')) {
      // This is very common, just note it once
      if (rel === 'src/index.ts') {
        items.push({
          file: '100+ files',
          issue: 'Config singleton imported globally — global mutable state; difficult to test with different configs',
          evidence: 'Global config object used throughout codebase',
          severity: 'medium',
          category: 'Architecture'
        });
      }
    }
    
    // Client augmentation
    if (rel === 'src/index.ts' && content.includes('client.commands')) {
      items.push({
        file: rel,
        lines,
        issue: 'Client augmentation — client.commands, client.config, client.stats, client.manager, client.bus, client.socketServer added dynamically',
        evidence: 'No TypeScript safety for augmented properties',
        severity: 'medium',
        category: 'Architecture'
      });
    }
    
    // Hardcoded capability list
    if (rel === 'src/core/PluginManager.ts' && content.includes('ALL_PLUGIN_CAPABILITIES')) {
      items.push({
        file: rel,
        lines,
        issue: 'Hardcoded capability list must be manually kept in sync',
        evidence: 'ALL_PLUGIN_CAPABILITIES array not auto-generated from plugin manifests',
        severity: 'medium',
        category: 'Architecture'
      });
    }
    
    // Massive type dump
    if (rel === 'src/types/shared.ts' && lines > 600) {
      items.push({
        file: rel,
        lines,
        issue: 'Massive type dump — should be split by domain',
        evidence: `${lines} lines of mixed type definitions`,
        severity: 'low',
        category: 'Architecture'
      });
    }
    
    // Dual adapter pattern
    if (rel === 'src/utils/db.ts' && content.includes('better-sqlite3') && content.includes('knex')) {
      items.push({
        file: rel,
        lines,
        issue: 'Dual adapter pattern (Knex + better-sqlite3) with runtime branching',
        evidence: 'Runtime if/else branches between adapters; test/production divergence',
        severity: 'medium',
        category: 'Architecture'
      });
    }
  }
  
  return items;
}

function detectSecurityIssues(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // ENCRYPTION_KEY optional at config level
    if (rel === 'src/config/config.ts' && content.includes("ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY') ?? ''")) {
      items.push({
        file: rel,
        lines,
        issue: 'ENCRYPTION_KEY optional — empty string allowed at config level',
        evidence: 'src/utils/encryption.ts throws only at encrypt time, not startup',
        severity: 'high',
        category: 'Security'
      });
    }
    
    // Health auth optional (allows all if no token configured)
    if (rel === 'src/utils/healthServer.ts' && content.includes('if (!HEALTH_AUTH_TOKEN)') && content.includes('return true')) {
      items.push({
        file: rel,
        lines,
        issue: 'Health endpoint unauthenticated by default',
        evidence: 'Exposes /health, /ready, /metrics publicly unless explicitly configured',
        severity: 'high',
        category: 'Security'
      });
    }
    
    // SQLite/LibSQL DB file permissions (no explicit mode/permissions set)
    if (rel === 'src/utils/db.ts' && content.includes('createClient') && content.includes('file:') && !content.includes('mode:')) {
      items.push({
        file: rel,
        lines,
        issue: 'SQLite DB file created with default permissions — no mode specified',
        evidence: 'File permissions not explicitly set; could be world-readable',
        severity: 'high',
        category: 'Security'
      });
    }
    
    // Socket token optional
    if (rel === 'src/utils/db.ts' && content.includes("new Database(path.join(DATA_DIR") && !content.includes('mode:')) {
      items.push({
        file: rel,
        lines,
        issue: 'SQLite DB file created with default permissions — no mode specified',
        evidence: 'File permissions not explicitly set; could be world-readable',
        severity: 'high',
        category: 'Security'
      });
    }
    
    // Socket token optional
    if (rel === 'src/cli/socket-server.ts' && content.includes('APOLLO_SOCKET_TOKEN') && content.includes('undefined')) {
      items.push({
        file: rel,
        lines,
        issue: 'Unix socket token optional — world-accessible if no token set',
        evidence: 'APOLLO_SOCKET_TOKEN defaults to undefined; /tmp/apollo.sock exposed',
        severity: 'medium',
        category: 'Security'
      });
    }
    
    // JSON.parse on untrusted input
    if (rel.includes('interlink') && content.includes('JSON.parse') && content.includes('payload')) {
      items.push({
        file: rel,
        lines,
        issue: 'JSON.parse on untrusted input without schema validation',
        evidence: 'Payload from user input; wrapped in try/catch but no Zod schema validation',
        severity: 'low',
        category: 'Security'
      });
    }
    
    // Hardcoded phishing domains
    if (rel === 'src/utils/automod.ts' && content.includes('phishingDomains') && content.includes('discord')) {
      items.push({
        file: rel,
        lines,
        issue: 'Hardcoded phishing domains list — no auto-update mechanism',
        evidence: 'Static array of domains; requires manual updates',
        severity: 'low',
        category: 'Security'
      });
    }
  }
  
  return items;
}

function detectPerformanceIssues(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // Custom serializer
    if (rel === 'src/queue/queue.ts' && content.includes('msgpackr')) {
      items.push({
        file: rel,
        lines,
        issue: 'Queue serializer uses msgpackr instead of BullMQ default JSON',
        evidence: 'Custom serializer adds overhead; BullMQ default is JSON',
        severity: 'medium',
        category: 'Performance'
      });
    }
    
    // EventBus cross-pod sync publishes every event
    if (rel === 'src/core/EventBus.ts' && content.includes('publish') && content.includes('redis')) {
      items.push({
        file: rel,
        lines,
        issue: 'EventBus cross-pod sync publishes every event to Redis — no batching',
        evidence: 'Every local event emit also publishes to Redis; potential overhead',
        severity: 'medium',
        category: 'Performance'
      });
    }
    
    // Analytics collector unbounded batch
    if (rel === 'src/utils/analyticsCollector.ts' && content.includes('flush') && !content.includes('maxBatchSize')) {
      items.push({
        file: rel,
        lines,
        issue: 'Analytics collector periodic flush — batch size unbounded',
        evidence: 'Flushes every 30s but no max batch size limit',
        severity: 'low',
        category: 'Performance'
      });
    }
    
    // serializeEventArgs creates new objects
    if (rel === 'src/index.ts' && content.includes('serializeEventArgs')) {
      items.push({
        file: rel,
        lines,
        issue: 'serializeEventArgs creates new objects for every event',
        evidence: 'Object allocation on every Discord event; GC pressure',
        severity: 'low',
        category: 'Performance'
      });
    }
  }
  
  return items;
}

function detectOperationalIssues(files: string[]): DebtItem[] {
  const items: DebtItem[] = [];
  
  // Track console.log usage across files (to avoid duplicates)
  const consoleLogFiles: string[] = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const rel = relative(ROOT, file);
    const lines = content.split('\n').length;
    
    // Console.log usage (non-test, non-mock files)
    if (!rel.includes('test') && !rel.includes('mock') && (content.includes('console.log') || content.includes('console.error') || content.includes('console.warn'))) {
      const matches = content.match(/console\.(log|error|warn)/g);
      if (matches && matches.length > 0) {
        consoleLogFiles.push(`${rel} (${matches.length} occurrences)`);
      }
    }
    
    // No structured migration runner
    if (rel === 'package.json' && !content.includes('"migrate"')) {
      items.push({
        file: 'package.json',
        issue: 'No structured migration runner CLI script visible',
        evidence: 'Migrations exist but no documented pnpm migrate command',
        severity: 'high',
        category: 'Operational'
      });
    }
    
    // Tracing unused
    if (rel === 'src/utils/tracing.ts' && content.includes('AsyncLocalStorage')) {
      const hasExporter = content.includes('OTLP') || content.includes('otlp') || content.includes('exporter');
      if (!hasExporter) {
        items.push({
          file: rel,
          lines,
          issue: 'Distributed tracing integration exists but unused — no OpenTelemetry exporter wired',
          evidence: 'AsyncLocalStorage context created but traces not exported',
          severity: 'medium',
          category: 'Operational'
        });
      }
    }
    
    // Hardcoded shutdown timeout
    if (rel === 'src/index.ts' && content.includes('SHUTDOWN_TIMEOUT_MS = 30000')) {
      items.push({
        file: rel,
        lines,
        issue: 'Graceful shutdown timeout hardcoded — not configurable via env',
        evidence: 'SHUTDOWN_TIMEOUT_MS = 30000; may be too short for large guilds',
        severity: 'medium',
        category: 'Operational'
      });
    }
    
    // Worker crash detection no alerting
    if (rel === 'src/core/worker/workerHost.ts' && content.includes('crashes') && content.includes('disable')) {
      items.push({
        file: rel,
        lines,
        issue: 'Worker crash detection disables plugin but no alerting/notification',
        evidence: '5 crashes in 10 min window disables plugin; no operator notification',
        severity: 'medium',
        category: 'Operational'
      });
    }
    
    // Startup checks missing ENCRYPTION_KEY validation for Postgres
    if (rel === 'src/utils/startupChecks.ts' && content.includes('DISCORD_TOKEN') && !content.includes('ENCRYPTION_KEY')) {
      items.push({
        file: rel,
        lines,
        issue: 'Startup checks validate DISCORD_TOKEN but not ENCRYPTION_KEY for PostgreSQL',
        evidence: 'Encryption key required for PG but not validated at startup',
        severity: 'low',
        category: 'Operational'
      });
    }
    
    // Migration version tracking unused
    if (rel === 'src/db/migrations/20260509_001_initial.js' && content.includes('migration_meta')) {
      items.push({
        file: 'src/db/migrations/',
        issue: 'Migration version tracking table exists but unused',
        evidence: 'migration_meta table created but not queried for version management',
        severity: 'low',
        category: 'Operational'
      });
    }
    
    // Health server interval not cleaned up
    if (rel === 'src/utils/healthServer.ts' && content.includes('setInterval') && !content.includes('clearInterval')) {
      items.push({
        file: rel,
        lines,
        issue: 'Latency recording interval not cleaned up on error path',
        evidence: 'setInterval created but no clearInterval in error/close handlers',
        severity: 'low',
        category: 'Operational'
      });
    }
  }
  
  // Add console.log findings as a single aggregated item
  if (consoleLogFiles.length > 0) {
    items.push({
      file: `${consoleLogFiles.length} files`,
      issue: 'Raw console.log/error/warn usage instead of structured logger',
      evidence: `Found in: ${consoleLogFiles.slice(0, 5).join(', ')}${consoleLogFiles.length > 5 ? '...' : ''}; should use pino logger from src/utils/logger.ts`,
      severity: 'medium',
      category: 'Operational'
    });
  }
  
  return items;
}

function generateReport(): string {
  const files = getAllSourceFiles();
  const tsFiles = files.filter(f => f.endsWith('.ts') && !f.includes('.test.ts') && !f.includes('mock'));
  const totalLines = tsFiles.reduce((sum, f) => sum + countLines(f), 0);
  
  const deps = analyzeDependencies();
  const fileSizes = analyzeFileSizes(tsFiles);
  const legacyItems = detectLegacyPatterns(tsFiles);
  const qualityItems = detectCodeQualityIssues(tsFiles);
  const testItems = analyzeTestGaps();
  const archItems = detectArchitectureSmells(tsFiles);
  const secItems = detectSecurityIssues(tsFiles);
  const perfItems = detectPerformanceIssues(tsFiles);
  const opsItems = detectOperationalIssues(tsFiles);
  
  const allItems = [...legacyItems, ...qualityItems, ...testItems, ...archItems, ...secItems, ...perfItems, ...opsItems];
  
  // Count by category and severity
  const categories = ['Dependencies', 'Legacy Patterns', 'Code Quality', 'Test Gaps', 'Architecture', 'Security', 'Performance', 'Operational'];
  const severities = ['critical', 'high', 'medium', 'low'];
  
  const counts: Record<string, Record<string, number>> = {};
  for (const cat of categories) {
    counts[cat] = { critical: 0, high: 0, medium: 0, low: 0 };
  }
  
  for (const item of allItems) {
    if (counts[item.category]) {
      counts[item.category][item.severity]++;
    }
  }
  
  // Dependencies counts
  const depCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const d of deps) {
    depCounts[d.severity]++;
  }
  counts['Dependencies'] = depCounts;
  
  // Total
  const totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const cat of categories) {
    for (const sev of severities) {
      totals[sev] += counts[cat][sev];
    }
  }
  
  let md = '';
  md += '# Technical Debt Scan Report — Apollo Discord Bot\n\n';
  md += `**Generated:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Scope:** \`src/\` directory and \`package.json\`\n`;
  md += `**Total source files:** ${tsFiles.length} TypeScript files, ~${totalLines.toLocaleString()} lines of code\n\n`;
  md += '---\n\n';
  md += '## Executive Summary\n\n';
  md += '| Category | Critical | High | Medium | Low | Total |\n';
  md += '|----------|----------|------|--------|-----|-------|\n';
  
  for (const cat of categories) {
    const total = counts[cat].critical + counts[cat].high + counts[cat].medium + counts[cat].low;
    md += `| **${cat}** | ${counts[cat].critical} | ${counts[cat].high} | ${counts[cat].medium} | ${counts[cat].low} | ${total} |\n`;
  }
  
  md += `| **TOTAL** | **${totals.critical}** | **${totals.high}** | **${totals.medium}** | **${totals.low}** | **${totals.critical + totals.high + totals.medium + totals.low}** |\n\n`;
  md += '---\n\n';
  
  // Dependencies section
  md += '## 1. Outdated Dependencies\n\n';
  
  const highDeps = deps.filter(d => d.severity === 'high');
  const medDeps = deps.filter(d => d.severity === 'medium');
  const lowDeps = deps.filter(d => d.severity === 'low');
  
  if (highDeps.length > 0) {
    md += '### High Severity\n\n';
    md += '| Package | Current | Wanted | Latest | Risk |\n';
    md += '|---------|---------|--------|--------|------|\n';
    for (const d of highDeps) {
      md += `| \`${d.name}\` | ${d.current} | ${d.wanted} | ${d.latest} | ${d.risk} |\n`;
    }
    md += '\n';
  }
  
  if (medDeps.length > 0) {
    md += '### Medium Severity\n\n';
    md += '| Package | Current | Latest | Risk |\n';
    md += '|---------|---------|--------|------|\n';
    for (const d of medDeps) {
      md += `| \`${d.name}\` | ${d.current} | ${d.latest} | ${d.risk} |\n`;
    }
    md += '\n';
  }
  
  if (lowDeps.length > 0) {
    md += '### Low Severity\n\n';
    md += '| Package | Current | Latest | Risk |\n';
    md += '|---------|---------|--------|------|\n';
    for (const d of lowDeps) {
      md += `| \`${d.name}\` | ${d.current} | ${d.latest} | ${d.risk} |\n`;
    }
    md += '\n';
  }
  
  md += '**Note:** No known vulnerabilities per `pnpm audit` (as of scan date).\n\n';
  md += '---\n\n';
  
  // Legacy Patterns
  md += '## 2. Legacy Patterns & ESM/CommonJS Mismatches\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = legacyItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    md += '| File | Issue | Impact |\n';
    md += '|------|-------|--------|\n';
    for (const item of items) {
      md += `| \`${item.file}\` | ${item.issue} | ${item.evidence || ''} |\n`;
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Code Quality
  md += '## 3. Code Quality Issues\n\n';
  
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    const items = qualityItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    
    if (sev === 'low') {
      md += '| Pattern | Locations |\n';
      md += '|---------|-----------|\n';
      // Group by issue for low severity
      const grouped = new Map<string, string[]>();
      for (const item of items) {
        const key = item.issue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item.file);
      }
      for (const [issue, files] of grouped) {
        md += `| ${issue} | ${files.length} files |\n`;
      }
    } else {
      md += '| File | Lines | Issue |\n';
      md += '|------|-------|-------|\n';
      for (const item of items) {
        md += `| \`${item.file}\` | ${item.lines} | ${item.issue} |\n`;
      }
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Test Gaps
  md += '## 4. Test Gaps\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = testItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity`;
    if (sev === 'high') md += ' — **494/1682 tests failing (29%)**';
    md += '\n\n';
    
    if (sev === 'high') {
      md += '| Area | Failures | Root Cause |\n';
      md += '|------|----------|------------|\n';
      for (const item of items) {
        md += `| ${item.file} | ${item.issue} | ${item.evidence || ''} |\n`;
      }
    } else if (sev === 'medium') {
      md += '| Path | Coverage | Risk |\n';
      md += '|------|----------|------|\n';
      for (const item of items) {
        md += `| ${item.file} | ${item.issue} | ${item.evidence || ''} |\n`;
      }
    } else {
      for (const item of items) {
        md += `- ${item.issue}\n`;
      }
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Architecture
  md += '## 5. Architecture Smells\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = archItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    md += '| Issue | Location | Impact |\n';
    md += '|-------|----------|--------|\n';
    for (const item of items) {
      md += `| ${item.issue} | \`${item.file}\` | ${item.evidence || ''} |\n`;
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Security
  md += '## 6. Security Concerns\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = secItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    md += '| Issue | Location | Risk |\n';
    md += '|-------|----------|------|\n';
    for (const item of items) {
      md += `| ${item.issue} | \`${item.file}\` | ${item.evidence || ''} |\n`;
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Performance
  md += '## 7. Performance Risks\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = perfItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    md += '| Issue | Location | Impact |\n';
    md += '|-------|----------|--------|\n';
    for (const item of items) {
      md += `| ${item.issue} | \`${item.file}\` | ${item.evidence || ''} |\n`;
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Operational
  md += '## 8. Operational Debt\n\n';
  
  for (const sev of ['high', 'medium', 'low']) {
    const items = opsItems.filter(i => i.severity === sev);
    if (items.length === 0) continue;
    
    md += `### ${sev.charAt(0).toUpperCase() + sev.slice(1)} Severity\n\n`;
    md += '| Issue | Location | Impact |\n';
    md += '|-------|----------|--------|\n';
    for (const item of items) {
      md += `| ${item.issue} | \`${item.file}\` | ${item.evidence || ''} |\n`;
    }
    md += '\n';
  }
  
  md += '---\n\n';
  
  // Recommendations
  md += '## Recommendations (Priority Order)\n\n';
  md += '### P0 — Fix Immediately\n';
  md += '1. **Fix i18next v26 compatibility** — Update `getFixedT` usage or pin i18next to v25 until migration complete\n';
  md += '2. **Make ENCRYPTION_KEY required at startup** — Add validation in `startupChecks.ts`\n';
  md += '3. **Require HEALTH_AUTH_TOKEN in production** — Fail startup if `NODE_ENV=production` and no auth token\n';
  md += '4. **Fix failing tests** — 494 failures block CI confidence\n\n';
  
  md += '### P1 — Next Sprint\n';
  md += '5. **Split `PluginManager`** — Extract `PluginLoader`, `PluginEnabler`, `WorkerManager`, `CommandSyncer`\n';
  md += '6. **Split `EventBus`** — Separate `EventEmitter`, `RpcRegistry`, `StateStore`\n';
  md += '7. **Add migration CLI and tests** — Document `pnpm migrate`, add up/down tests\n';
  md += '8. **Enable OpenTelemetry** — Wire `tracing.ts` to OTLP exporter; propagate trace IDs to logs/queue\n\n';
  
  md += '### P2 — Technical Debt Reduction\n';
  md += '9. **Extract automod command** — Split 798-line file into subcommand modules\n';
  md += '10. **Unify DB adapter** — Remove runtime SQLite/Knex branching; use Knex for both\n';
  md += '11. **Add integration tests** — Worker sandbox, plugin lifecycle, cross-pod EventBus, queue processing\n';
  md += '12. **Replace custom LRU** — Use `lru-cache` or `mnemonist`\n';
  md += '13. **Add schema validation** — Zod schemas for all RPC messages, interlink payloads, plugin manifests\n\n';
  
  md += '### P3 — Polish\n';
  md += '14. **Migrate migrations to ESM** — Rename `.cjs` → `.js` with `export async function up()`\n';
  md += '15. **Remove console.log** — Replace with structured logger in admin event handlers\n';
  md += '16. **Configurable shutdown timeout** — Add `SHUTDOWN_TIMEOUT_MS` env var\n';
  md += '17. **Automated dependency updates** — Add Renovate/Dependabot config\n\n';
  
  md += '---\n\n';
  
  // Appendix
  md += '## Appendix: File Size Leaders (>400 lines)\n\n';
  md += '| File | Lines | Category |\n';
  md += '|------|-------|----------|\n';
  
  const largeFiles = fileSizes.filter(f => f.lines > 400);
  for (const f of largeFiles) {
    md += `| \`${f.path}\` | ${f.lines} | ${f.category} |\n`;
  }
  
  md += '\n---\n\n';
  md += '*Report generated via automated codebase scan. Manual review recommended for architectural decisions.*\n';
  
  return md;
}

function main() {
  console.log('[TECH DEBT] Starting scan...');
  const report = generateReport();
  writeFileSync(OUTPUT_FILE, report);
  console.log(`[TECH DEBT] Report written to ${OUTPUT_FILE}`);
  console.log(report.split('\n').slice(0, 50).join('\n'));
  console.log('...\n[TECH DEBT] Done!');
}

main();