# SLI/SLO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 SLIs with p95/p99 latency targets, Prometheus recording rules, burn-rate alerts, Grafana dashboard, and error-budget policy documentation for Apollo Discord Bot v3.

**Architecture:** Extend existing Prometheus metrics substrate in `src/utils/metrics.ts` with 2 new metrics (gateway connected gauge, queue job outcome counter), add recording rules for 30-day rolling SLO targets, configure burn-rate alerting, and document policy.

**Tech Stack:** TypeScript, @prometheus-io/client, Prometheus recording/alerting rules, Grafana dashboard JSON, markdown documentation.

**Spec:** Librarian research output (proportional scaling for guild-scoped bot **architected for** 100-1000 guilds, solo/small team) + existing metrics substrate in `src/utils/metrics.ts`, `src/utils/healthServer.ts`, `src/gateway/leader.ts`, `src/queue/queue.ts`.

## Global Constraints

- pnpm only for commands; Node 22+; TypeScript strict mode; ESM with `.js` imports
- Metrics must use existing `apollo_` prefix and registry pattern from `metrics.ts`
- Cardinality: No `guild` label on high-cardinality metrics (commandsTotal already violates this - must fix)
- All new metrics exported from `metrics.ts` and registered in default registry
- Recording rules output to `prometheus/rules/slo.rules.yml` (new file)
- Alert rules output to `prometheus/rules/alerts.rules.yml` (new file)
- Dashboard JSON output to `grafana/dashboards/apollo-slo.json` (new file)
- Policy doc at `docs/observability/slos.md` (new file)
- Tests follow Vitest pattern in `tests/utils/metrics.test.ts`

## Review Focus

1. **Cardinality explosion** — `guild` label on commandsTotal creates unbounded series at scale; tests must verify guild label is removed or guarded
2. **p99 histogram buckets** — commandDuration histogram max bucket is 10s; p99 at 5s target requires buckets covering 5s region; verify bucket boundaries
3. **Gateway failover window** — leader election failover takes ~TTL/3 (3.3s default); SLO target 99.5% must account for this expected unavailability
4. **Queue backlog definition** — "backlog <100 in 5min" needs precise PromQL: queueDepth gauge + time window; test must verify metric exists
5. **Recording rule evaluation interval** — 30-day rolling requires `30d` window; Prometheus retention must support; test recording rule syntax

---

### Task 1: Fix commandsTotal cardinality (remove guild label)

**Files:**
- Modify: `src/utils/metrics.ts:85-95` (commandsTotal definition)
- Modify: `src/utils/metrics.ts:180-195` (recordCommand helper)
- Test: `tests/utils/metrics.test.ts`

**Interfaces:**
- Consumes: existing `createMetrics()` factory
- Produces: `commandsTotal` counter without `guild` label; `recordCommand(command, status)` signature unchanged

- [ ] **Step 1: Write failing test for cardinality fix**

```typescript
// tests/utils/metrics.test.ts - add to existing describe block
it('commandsTotal should not have guild label', () => {
  const m = createMetrics();
  m.recordCommand('ping', 'success');
  const json = m.getMetricsAsJSON();
  const cmdTotal = json.find(m => m.name === 'apollo_commands_total');
  expect(cmdTotal).toBeDefined();
  expect(cmdTotal?.values.every(v => !v.metric.guild)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: FAIL - guild label still present

- [ ] **Step 3: Remove guild label from commandsTotal definition**

```typescript
// src/utils/metrics.ts - replace lines 85-95
export const commandsTotal = new Counter({
  name: 'apollo_commands_total',
  help: 'Total number of slash commands executed',
  labelNames: ['command', 'status'],
  registers: [register],
});
```

- [ ] **Step 4: Update recordCommand to not pass guild**

```typescript
// src/utils/metrics.ts - replace lines 180-195
export function recordCommand(command: string, status: 'success' | 'error'): void {
  commandsTotal.inc({ command, status });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: PASS

- [ ] **Step 6: Run full test suite to ensure no regressions**

```bash
pnpm vitest run
```
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/utils/metrics.ts tests/utils/metrics.test.ts
git commit -m "fix(metrics): remove guild label from commandsTotal to prevent cardinality explosion"
```

---

### Task 2: Add gateway_connected gauge metric

**Files:**
- Modify: `src/utils/metrics.ts` (add new gauge)
- Modify: `src/gateway/leader.ts` (record gauge on lock acquire/release)
- Test: `tests/utils/metrics.test.ts`

**Interfaces:**
- Consumes: `createMetrics()` factory, leader election lifecycle
- Produces: `apollo_gateway_connected` gauge (value 1 = leader, 0 = not leader)

- [ ] **Step 1: Write failing test for gateway_connected gauge**

```typescript
// tests/utils/metrics.test.ts - add new test
it('should have gateway_connected gauge', () => {
  const m = createMetrics();
  const json = m.getMetricsAsJSON();
  const gauge = json.find(m => m.name === 'apollo_gateway_connected');
  expect(gauge).toBeDefined();
  expect(gauge?.type).toBe('gauge');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: FAIL - gauge not defined

- [ ] **Step 3: Add gateway_connected gauge to metrics.ts**

```typescript
// src/utils/metrics.ts - add after gatewayLatencyMs (around line 165)
export const gatewayConnected = new Gauge({
  name: 'apollo_gateway_connected',
  help: 'Whether this pod is the active gateway leader (1) or not (0)',
  labelNames: [],
  registers: [register],
});
```

- [ ] **Step 4: Export gatewayConnected from metrics.ts**

```typescript
// src/utils/metrics.ts - add to exports at bottom
export { gatewayConnected };
```

- [ ] **Step 5: Import and use in leader.ts on lock acquire/release**

```typescript
// src/gateway/leader.ts - add import at top
import { gatewayConnected } from '../utils/metrics.js';
```

```typescript
// src/gateway/leader.ts - in acquireGlobalLock success path (after line ~75)
gatewayConnected.set(1);
```

```typescript
// src/gateway/leader.ts - in releaseLock and stopHeartbeat (after line ~105)
gatewayConnected.set(0);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
pnpm vitest run
```
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/utils/metrics.ts src/gateway/leader.ts tests/utils/metrics.test.ts
git commit -m "feat(metrics): add gateway_connected gauge for leader SLO"
```

---

### Task 3: Add queue_jobs_total counter with outcome label

**Files:**
- Modify: `src/utils/metrics.ts` (add new counter)
- Modify: `src/queue/jobs/processCommand.ts` (record outcome)
- Test: `tests/utils/metrics.test.ts`

**Interfaces:**
- Consumes: `createMetrics()` factory, job processing lifecycle
- Produces: `apollo_queue_jobs_total` counter with labels `queue`, `outcome` (success|failed|retry)

- [ ] **Step 1: Write failing test for queue_jobs_total**

```typescript
// tests/utils/metrics.test.ts
it('should have queue_jobs_total counter with queue and outcome labels', () => {
  const m = createMetrics();
  const json = m.getMetricsAsJSON();
  const counter = json.find(m => m.name === 'apollo_queue_jobs_total');
  expect(counter).toBeDefined();
  expect(counter?.type).toBe('counter');
  const labelNames = counter?.values[0]?.metric ? Object.keys(counter.values[0].metric) : [];
  expect(labelNames).toContain('queue');
  expect(labelNames).toContain('outcome');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: FAIL - counter not defined

- [ ] **Step 3: Add queue_jobs_total counter to metrics.ts**

```typescript
// src/utils/metrics.ts - add after queueDepth gauge (around line 110)
export const queueJobsTotal = new Counter({
  name: 'apollo_queue_jobs_total',
  help: 'Total number of queue jobs processed by outcome',
  labelNames: ['queue', 'outcome'],
  registers: [register],
});
```

- [ ] **Step 4: Export queueJobsTotal from metrics.ts**

```typescript
// src/utils/metrics.ts - add to exports
export { queueJobsTotal };
```

- [ ] **Step 5: Import and record in processCommand.ts**

```typescript
// src/queue/jobs/processCommand.ts - add import
import { queueJobsTotal } from '../../utils/metrics.js';
```

```typescript
// src/queue/jobs/processCommand.ts - in processCommandJob, after job completion (around line 60)
queueJobsTotal.inc({ queue: job.data.queueName ?? 'unknown', outcome: 'success' });
```

```typescript
// src/queue/jobs/processCommand.ts - in catch block (around line 75)
queueJobsTotal.inc({ queue: job.data.queueName ?? 'unknown', outcome: 'failed' });
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
pnpm vitest run
```
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/utils/metrics.ts src/queue/jobs/processCommand.ts tests/utils/metrics.test.ts
git commit -m "feat(metrics): add queue_jobs_total counter for queue reliability SLO"
```

---

### Task 4: Add command_latency_p99 recording rule (extend histogram buckets)

**Files:**
- Modify: `src/utils/metrics.ts` (extend commandDuration histogram buckets to cover p99=5s)
- Test: `tests/utils/metrics.test.ts`

**Interfaces:**
- Consumes: existing `commandDuration` histogram
- Produces: histogram with buckets extending to 10s+ for p99 accuracy

- [ ] **Step 1: Write failing test for histogram bucket coverage**

```typescript
// tests/utils/metrics.test.ts
it('commandDuration histogram should have buckets covering p99 (5s)', () => {
  const m = createMetrics();
  const json = m.getMetricsAsJSON();
  const hist = json.find(m => m.name === 'apollo_command_duration_seconds_bucket');
  expect(hist).toBeDefined();
  const buckets = hist?.values.map(v => parseFloat(v.metric.le)) ?? [];
  expect(buckets).toContain(5.0); // p99 target bucket
  expect(buckets).toContain(10.0); // upper bound
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: FAIL - 5.0 bucket missing

- [ ] **Step 3: Extend commandDuration buckets in metrics.ts**

```typescript
// src/utils/metrics.ts - replace commandDuration histogram buckets (around line 98)
buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 7.5, 10.0, 15.0, 30.0],
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/utils/metrics.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
pnpm vitest run
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/metrics.ts tests/utils/metrics.test.ts
git commit -m "feat(metrics): extend commandDuration histogram buckets for p99 SLO accuracy"
```

---

### Task 5: Create Prometheus recording rules for 5 SLIs

**Files:**
- Create: `prometheus/rules/slo.rules.yml`

**Interfaces:**
- Consumes: metrics from Tasks 1-4
- Produces: 5 recording rules evaluating 30-day rolling SLIs

- [ ] **Step 1: Create recording rules file**

```yaml
# prometheus/rules/slo.rules.yml
groups:
  - name: apollo-slo-recording
    interval: 1m
    rules:
      # command_success_ratio: 30-day rolling success rate
      - record: apollo:sli:command_success_ratio:30d
        expr: |
          sum(rate(apollo_commands_total{status="success"}[30d]))
          /
          sum(rate(apollo_commands_total[30d]))

      # command_latency_p95: 30-day rolling p95 latency
      - record: apollo:sli:command_latency_p95:30d
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(apollo_command_duration_seconds_bucket[30d]))
          )

      # command_latency_p99: 30-day rolling p99 latency
      - record: apollo:sli:command_latency_p99:30d
        expr: |
          histogram_quantile(0.99,
            sum by (le) (rate(apollo_command_duration_seconds_bucket[30d]))
          )

      # gateway_availability: 30-day rolling uptime (accounts for failover)
      - record: apollo:sli:gateway_availability:30d
        expr: |
          avg_over_time(apollo_gateway_connected[30d])

      # queue_job_reliability: 30-day rolling job success rate
      - record: apollo:sli:queue_job_reliability:30d
        expr: |
          sum(rate(apollo_queue_jobs_total{outcome="success"}[30d]))
          /
          sum(rate(apollo_queue_jobs_total[30d]))

      # error_rate: 30-day rolling error rate
      - record: apollo:sli:error_rate:30d
        expr: |
          sum(rate(apollo_errors_total[30d]))
          /
          sum(rate(apollo_commands_total[30d]))
```

- [ ] **Step 2: Validate YAML syntax**

```bash
yamllint prometheus/rules/slo.rules.yml
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add prometheus/rules/slo.rules.yml
git commit -m "feat(prometheus): add SLO recording rules for 5 SLIs (30-day rolling)"
```

---

### Task 6: Create Prometheus burn-rate alert rules

**Files:**
- Create: `prometheus/rules/alerts.rules.yml`

**Interfaces:**
- Consumes: recording rules from Task 5
- Produces: 6 alerts (fast/slow burn for each SLO + latency-specific)

- [ ] **Step 1: Create alert rules file**

```yaml
# prometheus/rules/alerts.rules.yml
groups:
  - name: apollo-slo-alerts
    interval: 1m
    rules:
      # Command success ratio - fast burn (2% error budget consumed in 1h)
      - alert: ApolloCommandSuccessRatioSLOFastBurn
        expr: |
          (1 - apollo:sli:command_success_ratio:30d) * 30 * 24 > 0.02 * 24
        for: 5m
        labels:
          severity: critical
          slo: command_success_ratio
        annotations:
          summary: "Command success ratio SLO fast burn (2% budget in 1h)"
          description: "Error budget consumption rate exceeds 2%/hour. Current ratio: {{ $value | humanizePercentage }}"

      # Command success ratio - slow burn (10% budget in 6h)
      - alert: ApolloCommandSuccessRatioSLOSlowBurn
        expr: |
          (1 - apollo:sli:command_success_ratio:30d) * 30 * 24 > 0.10 * 6
        for: 30m
        labels:
          severity: warning
          slo: command_success_ratio
        annotations:
          summary: "Command success ratio SLO slow burn (10% budget in 6h)"

      # Command latency p95 - fast burn
      - alert: ApolloCommandLatencyP95SLOFastBurn
        expr: |
          apollo:sli:command_latency_p95:30d > 2.0
        for: 5m
        labels:
          severity: critical
          slo: command_latency_p95
        annotations:
          summary: "Command p95 latency SLO breach (>2s)"

      # Command latency p99 - fast burn
      - alert: ApolloCommandLatencyP99SLOFastBurn
        expr: |
          apollo:sli:command_latency_p99:30d > 5.0
        for: 5m
        labels:
          severity: critical
          slo: command_latency_p99
        annotations:
          summary: "Command p99 latency SLO breach (>5s)"

      # Gateway availability - fast burn (failover window accounted in 99.5%)
      - alert: ApolloGatewayAvailabilitySLOFastBurn
        expr: |
          apollo:sli:gateway_availability:30d < 0.995
        for: 5m
        labels:
          severity: critical
          slo: gateway_availability
        annotations:
          summary: "Gateway availability SLO breach (<99.5%)"

      # Queue job reliability - fast burn
      - alert: ApolloQueueJobReliabilitySLOFastBurn
        expr: |
          apollo:sli:queue_job_reliability:30d < 0.99
        for: 5m
        labels:
          severity: critical
          slo: queue_job_reliability
        annotations:
          summary: "Queue job reliability SLO breach (<99%)"

      # Error rate - fast burn
      - alert: ApolloErrorRateSLOFastBurn
        expr: |
          apollo:sli:error_rate:30d > 0.01
        for: 5m
        labels:
          severity: warning
          slo: error_rate
        annotations:
          summary: "Error rate SLO breach (>1%)"
```

- [ ] **Step 2: Validate YAML syntax**

```bash
yamllint prometheus/rules/alerts.rules.yml
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add prometheus/rules/alerts.rules.yml
git commit -m "feat(prometheus): add burn-rate alert rules for all 5 SLIs"
```

---

### Task 7: Create Grafana dashboard JSON

**Files:**
- Create: `grafana/dashboards/apollo-slo.json`

**Interfaces:**
- Consumes: recording rules from Task 5
- Produces: Dashboard with 6 panels (5 SLI status + error budget burndown)

- [ ] **Step 1: Create dashboard JSON**

```json
{
  "dashboard": {
    "title": "Apollo SLO Dashboard",
    "uid": "apollo-slo",
    "tags": ["apollo", "slo", "reliability"],
    "timezone": "utc",
    "refresh": "1m",
    "time": { "from": "now-30d", "to": "now" },
    "panels": [
      {
        "title": "Command Success Ratio (30d)",
        "type": "stat",
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:command_success_ratio:30d", "legendFormat": "Success Ratio" }],
        "fieldConfig": {
          "defaults": { "unit": "percentunit", "min": 0.9, "max": 1, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 0.99 }, { "color": "green", "value": 0.995 }] }},
          "overrides": []
        }
      },
      {
        "title": "Command Latency p95 (30d)",
        "type": "stat",
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:command_latency_p95:30d", "legendFormat": "p95" }],
        "fieldConfig": {
          "defaults": { "unit": "s", "min": 0, "max": 5, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 1.5 }, { "color": "red", "value": 2.0 }] }},
          "overrides": []
        }
      },
      {
        "title": "Command Latency p99 (30d)",
        "type": "stat",
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:command_latency_p99:30d", "legendFormat": "p99" }],
        "fieldConfig": {
          "defaults": { "unit": "s", "min": 0, "max": 10, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 3.0 }, { "color": "red", "value": 5.0 }] }},
          "overrides": []
        }
      },
      {
        "title": "Gateway Availability (30d)",
        "type": "stat",
        "gridPos": { "x": 18, "y": 0, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:gateway_availability:30d", "legendFormat": "Availability" }],
        "fieldConfig": {
          "defaults": { "unit": "percentunit", "min": 0.95, "max": 1, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 0.995 }, { "color": "green", "value": 0.999 }] }},
          "overrides": []
        }
      },
      {
        "title": "Queue Job Reliability (30d)",
        "type": "stat",
        "gridPos": { "x": 0, "y": 4, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:queue_job_reliability:30d", "legendFormat": "Reliability" }],
        "fieldConfig": {
          "defaults": { "unit": "percentunit", "min": 0.9, "max": 1, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 0.99 }, { "color": "green", "value": 0.995 }] }},
          "overrides": []
        }
      },
      {
        "title": "Error Rate (30d)",
        "type": "stat",
        "gridPos": { "x": 6, "y": 4, "w": 6, "h": 4 },
        "targets": [{ "expr": "apollo:sli:error_rate:30d", "legendFormat": "Error Rate" }],
        "fieldConfig": {
          "defaults": { "unit": "percentunit", "min": 0, "max": 0.05, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 0.005 }, { "color": "red", "value": 0.01 }] }},
          "overrides": []
        }
      },
      {
        "title": "Error Budget Burndown - Command Success",
        "type": "timeseries",
        "gridPos": { "x": 12, "y": 4, "w": 12, "h": 8 },
        "targets": [
          { "expr": "1 - apollo:sli:command_success_ratio:30d", "legendFormat": "Consumed" },
          { "expr": "0.01", "legendFormat": "Budget (1%)" }
        ],
        "fieldConfig": { "defaults": { "unit": "percentunit" }}
      },
      {
        "title": "Error Budget Burndown - Latency p95",
        "type": "timeseries",
        "gridPos": { "x": 12, "y": 12, "w": 12, "h": 8 },
        "targets": [
          { "expr": "apollo:sli:command_latency_p95:30d / 2.0", "legendFormat": "Consumed (ratio to target)" },
          { "expr": "1.0", "legendFormat": "Budget (100%)" }
        ],
        "fieldConfig": { "defaults": { "unit": "percentunit" }}
      }
    ]
  },
  "overwrite": true
}
```

- [ ] **Step 2: Validate JSON syntax**

```bash
cat grafana/dashboards/apollo-slo.json | jq empty
```
Expected: No output (valid JSON)

- [ ] **Step 3: Commit**

```bash
git add grafana/dashboards/apollo-slo.json
git commit -m "feat(grafana): add Apollo SLO dashboard with 5 SLIs + error budget burndown"
```

---

### Task 8: Write SLO policy documentation

**Files:**
- Create: `docs/observability/slos.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: Human-readable policy for error budgets, alert response, review cadence

- [ ] **Step 1: Create policy document**

```markdown
# Apollo Discord Bot — Service Level Objectives (SLOs)

## Overview

This document defines the Service Level Indicators (SLIs), Service Level Objectives (SLOs), and error budget policy for Apollo Discord Bot v3. All targets are evaluated over a **30-day rolling window** unless otherwise noted.

## Service Level Indicators & Objectives

| SLI | Metric | SLO Target | Error Budget (30d) |
|-----|--------|------------|-------------------|
| Command Success Ratio | `apollo:sli:command_success_ratio:30d` | ≥ 99.0% | 7.2 hours |
| Command Latency p95 | `apollo:sli:command_latency_p95:30d` | ≤ 2.0s for 99% of commands | N/A (latency budget) |
| Command Latency p99 | `apollo:sli:command_latency_p99:30d` | ≤ 5.0s for 99% of commands | N/A (latency budget) |
| Gateway Availability | `apollo:sli:gateway_availability:30d` | ≥ 99.5% | 3.6 hours |
| Queue Job Reliability | `apollo:sli:queue_job_reliability:30d` | ≥ 99.0% | 7.2 hours |
| Error Rate | `apollo:sli:error_rate:30d` | < 1.0% | N/A (rate budget) |

## Error Budget Policy

### Budget Consumption

- **Fast burn alert** (2% budget/hour): Page on-call immediately — indicates active incident
- **Slow burn alert** (10% budget/6h): Create ticket for investigation within 4 hours
- **Budget exhausted**: Freeze non-critical deployments; prioritize reliability work

### Gateway Failover Window

The gateway leader election uses Redis-based fencing with a default TTL of 10s and heartbeat refresh every TTL/3 (~3.3s). A brief unavailability window during leader failover is **expected and budgeted** within the 99.5% availability target (3.6h/30d ≈ 7.2min/day). This accounts for:

- Lock acquisition contention
- Discord gateway reconnection
- Plugin reinitialization
- Scheduler handover via `withLock`

Do not page for individual failover events unless they exceed 30s or occur more than 2x/hour.

### Queue Backlog

The queue job reliability SLO (99%) assumes jobs complete within 5 minutes. Backlog exceeding 100 jobs for >5 minutes indicates processing degradation and should trigger the queue reliability alert.

## Alert Response Procedures

| Alert | Severity | Response | Runbook |
|-------|----------|----------|---------|
| `ApolloCommandSuccessRatioSLOFastBurn` | critical | Page immediately; check Discord API status, plugin errors, deployment rollback | `docs/runbooks/command-failure.md` (TODO) |
| `ApolloCommandLatencyP95SLOFastBurn` / `P99` | critical | Page immediately; check queue depth, external API latency, GC pauses | `docs/runbooks/latency-spike.md` (TODO) |
| `ApolloGatewayAvailabilitySLOFastBurn` | critical | Page immediately; check Redis, leader election logs, Discord gateway status | `docs/runbooks/gateway-failover.md` (TODO) |
| `ApolloQueueJobReliabilitySLOFastBurn` | critical | Page immediately; check worker health, Redis queue backlog, dead letter queue | `docs/runbooks/queue-backlog.md` (TODO) |
| `ApolloErrorRateSLOFastBurn` | warning | Ticket within 4h; check error logs, recent deployments | `docs/runbooks/error-rate.md` (TODO) |

## Review Cadence

- **Monthly**: Review SLO targets against actuals; adjust if business requirements change
- **Quarterly**: Review error budget consumption trends; plan reliability investments
- **Per-incident**: Postmortem must reference SLO impact and budget consumption

## Out of Scope

- Per-guild SLOs (cardinality not justified for **architected for** 100-1000 guilds)
- SLA/external contracts (Apollo is self-hosted, no customer SLA)
- Infrastructure SLOs (Redis, PostgreSQL, Discord API) — tracked separately

## References

- Recording rules: `prometheus/rules/slo.rules.yml`
- Alert rules: `prometheus/rules/alerts.rules.yml`
- Dashboard: `grafana/dashboards/apollo-slo.json`
- Metrics implementation: `src/utils/metrics.ts`
```

- [ ] **Step 2: Validate markdown links**

```bash
# Manual review - ensure all referenced files exist
```

- [ ] **Step 3: Commit**

```bash
git add docs/observability/slos.md
git commit -m "docs(observability): add SLO policy document with 5 SLIs, error budgets, and alert response"
```

---

### Task 9: Update AGENTS.md with SLO verification gates

**Files:**
- Modify: `AGENTS.md` (add SLO verification to verification gates table)

**Interfaces:**
- Consumes: completed implementation
- Produces: Updated agent contract requiring SLO validation

- [ ] **Step 1: Add SLO verification row to AGENTS.md**

```markdown
# In AGENTS.md, Table "Verification Before Completion" - add row:
| SLO/Observability changes | `pnpm lint`, `pnpm typecheck`, `pnpm vitest run tests/utils/metrics.test.ts`, Prometheus rule syntax validation (`promtool check rules`), dashboard JSON validation |
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add SLO/observability verification gates"
```

---

### Task 10: Final verification and integration test

**Files:**
- Test: Full test suite, lint, typecheck

**Interfaces:**
- Consumes: all previous tasks
- Produces: Verified working implementation

- [ ] **Step 1: Run full test suite**

```bash
pnpm vitest run
```
Expected: All tests pass (including new metric tests)

- [ ] **Step 2: Run lint and typecheck**

```bash
pnpm lint && pnpm typecheck
```
Expected: Zero errors

- [ ] **Step 3: Validate Prometheus rules**

```bash
promtool check rules prometheus/rules/slo.rules.yml prometheus/rules/alerts.rules.yml
```
Expected: No errors (requires promtool installed)

- [ ] **Step 4: Verify dashboard JSON**

```bash
cat grafana/dashboards/apollo-slo.json | jq empty
```
Expected: Valid JSON

- [ ] **Step 5: Commit any final changes**

```bash
git add -A
git commit -m "chore: final verification for SLI/SLO implementation"
```