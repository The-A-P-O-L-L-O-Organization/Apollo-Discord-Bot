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