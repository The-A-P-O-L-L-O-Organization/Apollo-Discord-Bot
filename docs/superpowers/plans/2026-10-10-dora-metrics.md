# DORA Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four DORA metrics (Deployment Frequency, Lead Time for Changes, Mean Time to Recovery, Change Failure Rate) using Apollo's existing Prometheus/GitHub Actions infrastructure, enabling data-driven engineering improvement.

**Architecture:** Add DORA metric collection via GitHub Actions workflow that emits Prometheus metrics to Pushgateway (or directly to Prometheus via remote write). Metrics derived from: GitHub deployments (frequency, lead time), health endpoint + alertmanager (MTTR), deployment success/failure (change failure rate). No new runtime dependencies in bot code.

**Tech Stack:** GitHub Actions, Prometheus Pushgateway (or remote write), `@prometheus-io/client` for metric format, existing `src/utils/metrics.ts` patterns, `src/utils/healthServer.ts` for health data

**Spec:** DORA "Four Keys" metrics definitions, `docs/observability/slos.md` (existing SLO framework)

## Global Constraints

- No new runtime dependencies in bot (`src/`) — metrics collected in CI/CD only
- Use existing Prometheus infrastructure (Pushgateway at `PROM_PUSHGATEWAY_URL` or remote write)
- Metrics must follow Prometheus naming: `apollo_dora_*`
- TypeScript strict mode for any new TS files
- Follow existing GitHub Actions patterns in `.github/workflows/`
- No secrets in metrics — only aggregated counters/gauges

## Review Focus

1. **Metric accuracy** — Lead time must measure from first commit to production deploy, not PR open to merge
2. **MTTR definition** — Must use actual incident resolution (alert firing → resolved), not deploy rollback time
3. **Change failure rate denominator** — Must count all production deployments, not just failed ones
4. **Data freshness** — Pushgateway metrics must have TTL < scrape interval to avoid stale data
5. **Label cardinality** — Keep labels minimal (environment, repo); no per-deployment or per-commit labels

---

### Task 1: Add DORA Metric Definitions to Metrics Module

**Files:**
- Modify: `src/utils/metrics.ts`
- Test: `tests/utils/metrics.test.ts`

**Interfaces:**
- Produces: 4 new metric creators in `createMetrics()` return object

- [ ] **Step 1: Add DORA metric definitions to metrics.ts**

```typescript
// src/utils/metrics.ts - add to createMetrics() function

// Deployment Frequency: counter incremented on each successful production deploy
doraDeploymentFrequency: new Counter({
  name: 'apollo_dora_deployment_frequency_total',
  help: 'Total number of production deployments',
  labelNames: ['environment'],
  registers: [registry]
}),

// Lead Time for Changes: histogram of seconds from commit to deploy
doraLeadTimeSeconds: new Histogram({
  name: 'apollo_dora_lead_time_seconds',
  help: 'Lead time from commit to production deployment in seconds',
  labelNames: ['environment'],
  buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400], // 5m to 24h
  registers: [registry]
}),

// Mean Time to Recovery: histogram of seconds from incident start to resolution
doraMTTRSeconds: new Histogram({
  name: 'apollo_dora_mttr_seconds',
  help: 'Mean time to recovery from incident in seconds',
  labelNames: ['environment', 'severity'],
  buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400],
  registers: [registry]
}),

// Change Failure Rate: counter for failed deployments
doraChangeFailureTotal: new Counter({
  name: 'apollo_dora_change_failure_total',
  help: 'Total number of failed production deployments',
  labelNames: ['environment'],
  registers: [registry]
}),

// Change Failure Rate: counter for total deployments (denominator)
doraChangeTotal: new Counter({
  name: 'apollo_dora_change_total',
  help: 'Total number of production deployments (success + failure)',
  labelNames: ['environment'],
  registers: [registry]
}),
```

- [ ] **Step 2: Add helper functions for recording DORA metrics**

```typescript
// src/utils/metrics.ts - add after metric definitions

export function recordDoraDeployment(metrics: ReturnType<typeof createMetrics>, environment: string, success: boolean) {
  metrics.doraDeploymentFrequency.inc({ environment })
  metrics.doraChangeTotal.inc({ environment })
  if (!success) {
    metrics.doraChangeFailureTotal.inc({ environment })
  }
}

export function recordDoraLeadTime(metrics: ReturnType<typeof createMetrics>, environment: string, seconds: number) {
  metrics.doraLeadTimeSeconds.observe({ environment }, seconds)
}

export function recordDoraMTTR(metrics: ReturnType<typeof createMetrics>, environment: string, severity: string, seconds: number) {
  metrics.doraMTTRSeconds.observe({ environment, severity }, seconds)
}
```

- [ ] **Step 3: Export new metrics from createMetrics return object**

```typescript
// In createMetrics() return statement, add:
doraDeploymentFrequency,
doraLeadTimeSeconds,
doraMTTRSeconds,
doraChangeFailureTotal,
doraChangeTotal,
recordDoraDeployment,
recordDoraLeadTime,
recordDoraMTTR,
```

- [ ] **Step 4: Add tests for new metrics**

```typescript
// tests/utils/metrics.test.ts - add to describe block

import { createMetrics } from '../../src/utils/metrics.js'

describe('DORA metrics', () => {
  it('records deployment frequency', () => {
    const { metrics, registry } = createMetrics()
    metrics.recordDoraDeployment(metrics, 'production', true)
    metrics.recordDoraDeployment(metrics, 'production', false)

    const snapshots = registry.getMetricsAsJSON()
    const freq = snapshots.find(m => m.name === 'test_apollo_dora_deployment_frequency_total')
    const total = snapshots.find(m => m.name === 'test_apollo_dora_change_total')
    const failed = snapshots.find(m => m.name === 'test_apollo_dora_change_failure_total')

    expect(freq?.values[0]?.value).toBe(2)
    expect(total?.values[0]?.value).toBe(2)
    expect(failed?.values[0]?.value).toBe(1)
  })

  it('records lead time histogram', () => {
    const { metrics, registry } = createMetrics()
    metrics.recordDoraLeadTime(metrics, 'production', 1800) // 30 min

    const snapshots = registry.getMetricsAsJSON()
    const hist = snapshots.find(m => m.name === 'test_apollo_dora_lead_time_seconds_bucket' && m.labels.le === '1800')
    expect(hist?.values[0]?.value).toBe(1)
  })

  it('records MTTR histogram', () => {
    const { metrics, registry } = createMetrics()
    metrics.recordDoraMTTR(metrics, 'production', 'critical', 3600) // 1 hour

    const snapshots = registry.getMetricsAsJSON()
    const hist = snapshots.find(m => m.name === 'test_apollo_dora_mttr_seconds_bucket' && m.labels.le === '3600')
    expect(hist?.values[0]?.value).toBe(1)
  })
})
```

- [ ] **Step 5: Run tests to verify**

Run: `pnpm vitest run tests/utils/metrics.test.ts -t "DORA"`
Expected: 3 PASS

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm typecheck` && `pnpm lint`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add src/utils/metrics.ts tests/utils/metrics.test.ts
git commit -m "metrics: add DORA metric definitions and helpers"
```

---

### Task 2: Create GitHub Actions Workflow for Deployment Metrics

**Files:**
- Create: `.github/workflows/dora-deployment-metrics.yml`

**Interfaces:**
- Consumes: GitHub deployment events, `PROM_PUSHGATEWAY_URL` secret
- Produces: Prometheus metrics pushed to Pushgateway

- [ ] **Step 1: Create workflow file**

```yaml
# .github/workflows/dora-deployment-metrics.yml
name: DORA Deployment Metrics

on:
  deployment_status:
    types: [created, success, failure, error]

env:
  PROM_PUSHGATEWAY_URL: ${{ secrets.PROM_PUSHGATEWAY_URL }}
  PROM_JOB_NAME: apollo-dora-deployment

jobs:
  record-deployment:
    if: github.event.deployment.environment == 'production'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 100

      - name: Calculate lead time
        id: leadtime
        run: |
          # Get commit SHA from deployment
          SHA="${{ github.event.deployment.sha }}"
          # Get commit timestamp
          COMMIT_TIME=$(git show -s --format=%ct "$SHA")
          # Current timestamp
          DEPLOY_TIME=$(date +%s)
          LEAD_TIME=$((DEPLOY_TIME - COMMIT_TIME))
          echo "lead_time=$LEAD_TIME" >> $GITHUB_OUTPUT

      - name: Push deployment metrics
        if: env.PROM_PUSHGATEWAY_URL != ''
        run: |
          ENVIRONMENT="${{ github.event.deployment.environment }}"
          STATUS="${{ github.event.deployment_status.state }}"
          LEAD_TIME="${{ steps.leadtime.outputs.lead_time }}"

          # Push metrics to Pushgateway
          cat <<EOF | curl -s --data-binary @- "${PROM_PUSHGATEWAY_URL}/metrics/job/${PROM_JOB_NAME}/instance/${ENVIRONMENT}"
          # TYPE apollo_dora_deployment_frequency_total counter
          apollo_dora_deployment_frequency_total{environment="${ENVIRONMENT}"} 1
          # TYPE apollo_dora_change_total counter
          apollo_dora_change_total{environment="${ENVIRONMENT}"} 1
          # TYPE apollo_dora_lead_time_seconds histogram
          apollo_dora_lead_time_seconds_bucket{environment="${ENVIRONMENT}",le="3600"} ${LEAD_TIME}
          apollo_dora_lead_time_seconds_bucket{environment="${ENVIRONMENT}",le="+Inf"} 1
          apollo_dora_lead_time_seconds_sum{environment="${ENVIRONMENT}"} ${LEAD_TIME}
          apollo_dora_lead_time_seconds_count{environment="${ENVIRONMENT}"} 1
          EOF

          if [ "$STATUS" != "success" ]; then
            cat <<EOF | curl -s --data-binary @- "${PROM_PUSHGATEWAY_URL}/metrics/job/${PROM_JOB_NAME}/instance/${ENVIRONMENT}"
            # TYPE apollo_dora_change_failure_total counter
            apollo_dora_change_failure_total{environment="${ENVIRONMENT}"} 1
            EOF
          fi

      - name: Log deployment info
        run: |
          echo "Deployment ${{ github.event.deployment.id }} to ${{ github.event.deployment.environment }}: ${{ github.event.deployment_status.state }}"
          echo "Lead time: ${{ steps.leadtime.outputs.lead_time }}s"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yamllint .github/workflows/dora-deployment-metrics.yml`
Expected: No errors

- [ ] **Step 3: Test workflow locally with act (optional)**

Run: `act deployment_status -s PROM_PUSHGATEWAY_URL=http://localhost:9091` (if act available)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/dora-deployment-metrics.yml
git commit -m "ci: add DORA deployment metrics workflow"
```

---

### Task 3: Create GitHub Actions Workflow for MTTR Metrics

**Files:**
- Create: `.github/workflows/dora-mttr-metrics.yml`

**Interfaces:**
- Consumes: GitHub Alert/Alertmanager webhook events, `PROM_PUSHGATEWAY_URL` secret
- Produces: MTTR histogram metrics

- [ ] **Step 1: Create workflow for incident tracking**

```yaml
# .github/workflows/dora-mttr-metrics.yml
name: DORA MTTR Metrics

on:
  repository_dispatch:
    types: [incident_created, incident_resolved]
  workflow_dispatch:
    inputs:
      incident_id:
        required: true
        type: string
      action:
        required: true
        type: choice
        options: [created, resolved]
      severity:
        required: true
        type: choice
        options: [critical, warning, info]

env:
  PROM_PUSHGATEWAY_URL: ${{ secrets.PROM_PUSHGATEWAY_URL }}
  PROM_JOB_NAME: apollo-dora-mttr

jobs:
  record-mttr:
    if: env.PROM_PUSHGATEWAY_URL != ''
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Record incident timestamp
        id: timestamp
        run: |
          ACTION="${{ github.event.inputs.action || github.event.client_payload.action }}"
          INCIDENT_ID="${{ github.event.inputs.incident_id || github.event.client_payload.incident_id }}"
          SEVERITY="${{ github.event.inputs.severity || github.event.client_payload.severity }}"

          if [ "$ACTION" = "created" ]; then
            echo "$INCIDENT_ID=$(date +%s)" >> $GITHUB_ENV
            echo "incident_created=true" >> $GITHUB_OUTPUT
          elif [ "$ACTION" = "resolved" ]; then
            START_TIME="${INCIDENT_ID}"
            if [ -z "$START_TIME" ]; then
              echo "No start time recorded for incident $INCIDENT_ID"
              exit 1
            fi
            END_TIME=$(date +%s)
            MTTR=$((END_TIME - START_TIME))
            echo "mttr=$MTTR" >> $GITHUB_OUTPUT
            echo "incident_resolved=true" >> $GITHUB_OUTPUT
          fi
        env:
          INCIDENT_ID: ${{ github.event.inputs.incident_id || github.event.client_payload.incident_id }}

      - name: Push MTTR metric on resolution
        if: steps.timestamp.outputs.incident_resolved == 'true'
        run: |
          MTTR="${{ steps.timestamp.outputs.mttr }}"
          SEVERITY="${{ github.event.inputs.severity || github.event.client_payload.severity }}"

          cat <<EOF | curl -s --data-binary @- "${PROM_PUSHGATEWAY_URL}/metrics/job/${PROM_JOB_NAME}/instance/production"
          # TYPE apollo_dora_mttr_seconds histogram
          apollo_dora_mttr_seconds_bucket{environment="production",severity="${SEVERITY}",le="3600"} ${MTTR}
          apollo_dora_mttr_seconds_bucket{environment="production",severity="${SEVERITY}",le="+Inf"} 1
          apollo_dora_mttr_seconds_sum{environment="production",severity="${SEVERITY}"} ${MTTR}
          apollo_dora_mttr_seconds_count{environment="production",severity="${SEVERITY}"} 1
          EOF

      - name: Log MTTR
        if: steps.timestamp.outputs.incident_resolved == 'true'
        run: echo "Incident ${{ github.event.inputs.incident_id }} resolved in ${{ steps.timestamp.outputs.mttr }}s (${{ github.event.inputs.severity }})"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `yamllint .github/workflows/dora-mttr-metrics.yml`
Expected: No errors

- [ ] **Step 3: Document how to trigger from Alertmanager**

```markdown
# In docs/runbooks/alertmanager-dora-integration.md

## Alertmanager Webhook Configuration

Add to alertmanager.yml:
```yaml
receivers:
  - name: 'dora-mttr'
    webhook_configs:
      - url: 'https://api.github.com/repos/${{ github.repository }}/dispatches'
        http_config:
          headers:
            Authorization: 'Bearer ${{ secrets.GITHUB_TOKEN }}'
            Accept: 'application/vnd.github+json'
        send_resolved: true
```

Trigger via repository_dispatch with:
```json
{
  "event_type": "incident_created",
  "client_payload": {
    "incident_id": "alertname-instance",
    "action": "created",
    "severity": "critical"
  }
}
```
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/dora-mttr-metrics.yml docs/runbooks/alertmanager-dora-integration.md
git commit -m "ci: add DORA MTTR metrics workflow and Alertmanager integration guide"
```

---

### Task 4: Add DORA Dashboard Panels to Grafana

**Files:**
- Modify: `grafana/dashboards/apollo-slo.json` (or create `grafana/dashboards/apollo-dora.json`)

**Interfaces:**
- Consumes: DORA metrics from Prometheus
- Produces: Grafana dashboard JSON with 4 panels

- [ ] **Step 1: Create DORA dashboard JSON**

```json
{
  "annotations": { "list": [] },
  "editable": true,
  "gnetId": null,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "palette-classic" },
          "custom": { "lineWidth": 1 },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 10 },
              { "color": "red", "value": 50 }
            ]
          },
          "unit": "short"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 1,
      "options": {
        "legend": { "calcs": ["lastNotNull"], "displayMode": "list", "placement": "bottom" },
        "tooltip": { "mode": "single" }
      },
      "pluginVersion": "9.0.0",
      "targets": [
        {
          "expr": "rate(apollo_dora_deployment_frequency_total[1d]) * 86400",
          "legendFormat": "Deployments/day",
          "refId": "A"
        }
      ],
      "title": "Deployment Frequency (per day)",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 3600 },
              { "color": "red", "value": 21600 }
            ]
          },
          "unit": "s"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "id": 2,
      "options": { "reduceOptions": { "values": false, "calcs": ["lastNotNull"] }, "showThresholdLabels": false, "showThresholdMarkers": true },
      "pluginVersion": "9.0.0",
      "targets": [
        {
          "expr": "histogram_quantile(0.5, rate(apollo_dora_lead_time_seconds_bucket[1h]))",
          "legendFormat": "p50 Lead Time",
          "refId": "A"
        },
        {
          "expr": "histogram_quantile(0.95, rate(apollo_dora_lead_time_seconds_bucket[1h]))",
          "legendFormat": "p95 Lead Time",
          "refId": "B"
        }
      ],
      "title": "Lead Time for Changes",
      "type": "gauge"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 1800 },
              { "color": "red", "value": 7200 }
            ]
          },
          "unit": "s"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "id": 3,
      "options": { "reduceOptions": { "values": false, "calcs": ["lastNotNull"] }, "showThresholdLabels": false, "showThresholdMarkers": true },
      "pluginVersion": "9.0.0",
      "targets": [
        {
          "expr": "histogram_quantile(0.5, rate(apollo_dora_mttr_seconds_bucket[1h]))",
          "legendFormat": "p50 MTTR",
          "refId": "A"
        },
        {
          "expr": "histogram_quantile(0.95, rate(apollo_dora_mttr_seconds_bucket[1h]))",
          "legendFormat": "p95 MTTR",
          "refId": "B"
        }
      ],
      "title": "Mean Time to Recovery",
      "type": "gauge"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": { "mode": "thresholds" },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 0.15 },
              { "color": "red", "value": 0.3 }
            ]
          },
          "unit": "percentunit"
        },
        "overrides": []
      },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "id": 4,
      "options": { "reduceOptions": { "values": false, "calcs": ["lastNotNull"] }, "showThresholdLabels": false, "showThresholdMarkers": true },
      "pluginVersion": "9.0.0",
      "targets": [
        {
          "expr": "rate(apollo_dora_change_failure_total[7d]) / rate(apollo_dora_change_total[7d])",
          "legendFormat": "Change Failure Rate (7d)",
          "refId": "A"
        }
      ],
      "title": "Change Failure Rate",
      "type": "stat"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["apollo", "dora"],
  "templating": { "list": [] },
  "time": { "from": "now-7d", "to": "now" },
  "timepicker": {},
  "timezone": "utc",
  "title": "Apollo DORA Metrics",
  "uid": "apollo-dora",
  "version": 1,
  "weekStart": ""
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `cat grafana/dashboards/apollo-dora.json | jq .`
Expected: Valid JSON output

- [ ] **Step 3: Commit**

```bash
git add grafana/dashboards/apollo-dora.json
git commit -m "grafana: add DORA metrics dashboard"
```

---

### Task 5: Add DORA Recording Rules for Prometheus

**Files:**
- Create: `prometheus/rules/dora.rules.yml`

**Interfaces:**
- Consumes: Raw DORA metrics from Pushgateway
- Produces: Pre-computed recording rules for dashboards/alerts

- [ ] **Step 1: Create recording rules**

```yaml
# prometheus/rules/dora.rules.yml
groups:
  - name: apollo-dora
    interval: 60s
    rules:
      # Deployment frequency per day (rolling)
      - record: apollo:dora:deployment_frequency_per_day
        expr: |
          rate(apollo_dora_deployment_frequency_total[24h]) * 86400

      # Lead time quantiles (1h window)
      - record: apollo:dora:lead_time:p50_1h
        expr: |
          histogram_quantile(0.50, rate(apollo_dora_lead_time_seconds_bucket[1h]))
      - record: apollo:dora:lead_time:p95_1h
        expr: |
          histogram_quantile(0.95, rate(apollo_dora_lead_time_seconds_bucket[1h]))
      - record: apollo:dora:lead_time:p99_1h
        expr: |
          histogram_quantile(0.99, rate(apollo_dora_lead_time_seconds_bucket[1h]))

      # MTTR quantiles (1h window)
      - record: apollo:dora:mttr:p50_1h
        expr: |
          histogram_quantile(0.50, rate(apollo_dora_mttr_seconds_bucket[1h]))
      - record: apollo:dora:mttr:p95_1h
        expr: |
          histogram_quantile(0.95, rate(apollo_dora_mttr_seconds_bucket[1h]))

      # Change failure rate (7d rolling)
      - record: apollo:dora:change_failure_rate_7d
        expr: |
          rate(apollo_dora_change_failure_total[7d]) / rate(apollo_dora_change_total[7d])
```

- [ ] **Step 2: Validate with promtool**

Run: `promtool check rules prometheus/rules/dora.rules.yml`
Expected: "checking prometheus/rules/dora.rules.yml\n  SUCCESS: 8 rules valid"

- [ ] **Step 3: Commit**

```bash
git add prometheus/rules/dora.rules.yml
git commit -m "prometheus: add DORA recording rules"
```

---

### Task 6: Add DORA Alert Rules

**Files:**
- Create: `prometheus/rules/dora-alerts.rules.yml`

**Interfaces:**
- Consumes: DORA recording rules
- Produces: Alert rules for DORA degradation

- [ ] **Step 1: Create alert rules**

```yaml
# prometheus/rules/dora-alerts.rules.yml
groups:
  - name: apollo-dora-alerts
    interval: 60s
    rules:
      # Deployment frequency dropped (no deploy in 48h)
      - alert: ApolloDORADeploymentFrequencyLow
        expr: |
          apollo:dora:deployment_frequency_per_day < 0.5
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Deployment frequency below 0.5/day"
          description: "No production deployment in >48 hours. Consider deploying more frequently."

      # Lead time p95 > 6 hours
      - alert: ApolloDORALeadTimeHigh
        expr: |
          apollo:dora:lead_time:p95_1h > 21600
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Lead time p95 > 6 hours"
          description: "Time from commit to production exceeds 6 hours at p95. Review CI/CD pipeline."

      # MTTR p95 > 2 hours
      - alert: ApolloDORAMTTRHigh
        expr: |
          apollo:dora:mttr:p95_1h > 7200
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "MTTR p95 > 2 hours"
          description: "Incident resolution taking too long. Review runbooks and on-call processes."

      # Change failure rate > 30% (7d)
      - alert: ApolloDORAChangeFailureRateHigh
        expr: |
          apollo:dora:change_failure_rate_7d > 0.3
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Change failure rate > 30% (7d)"
          description: "More than 30% of deployments failing. Review deployment process and testing."
```

- [ ] **Step 2: Validate with promtool**

Run: `promtool check rules prometheus/rules/dora-alerts.rules.yml`
Expected: "SUCCESS: 4 rules valid"

- [ ] **Step 3: Commit**

```bash
git add prometheus/rules/dora-alerts.rules.yml
git commit -m "prometheus: add DORA alert rules"
```

---

### Task 7: Update AGENTS.md Verification Gates

**Files:**
- Modify: `AGENTS.md` (verification section)

**Interfaces:**
- Produces: Updated verification commands for DORA metrics

- [ ] **Step 1: Add DORA verification to AGENTS.md**

```markdown
# In AGENTS.md verification table, add row:

| DORA metrics | `pnpm vitest run tests/utils/metrics.test.ts -t DORA`, `promtool check rules prometheus/rules/dora*.yml`, Grafana dashboard JSON validation |
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add DORA metrics verification gates to AGENTS.md"
```

---

### Task 8: Final Verification

**Files:**
- All: `src/utils/metrics.ts`, `.github/workflows/dora-*.yml`, `prometheus/rules/dora*.yml`, `grafana/dashboards/apollo-dora.json`

- [ ] **Step 1: Run metric tests**

Run: `pnpm vitest run tests/utils/metrics.test.ts -t DORA`
Expected: 3 PASS

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Validate Prometheus rules**

Run: `promtool check rules prometheus/rules/dora.rules.yml prometheus/rules/dora-alerts.rules.yml`
Expected: Both SUCCESS

- [ ] **Step 4: Validate Grafana dashboard JSON**

Run: `cat grafana/dashboards/apollo-dora.json | jq .`
Expected: Valid JSON

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm lint` && `pnpm typecheck`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "dora: final verification and commit"
```