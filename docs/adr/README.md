# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for Apollo Discord Bot v3.
We use the [MADR format](https://adr.github.io/madr/) (Markdown ADRs).

## Index

| # | Title | Status | Date | Supersedes |
|---|-------|--------|------|------------|
| 0001 | Monolith with Gateway/Worker Role Split | Accepted | 2026-09-27 | — |
| 0002 | Dual Database Adapters (SQLite/PostgreSQL) | Accepted | 2026-09-27 | — |
| 0003 | BullMQ + Redis with HMAC-Signed Jobs | Accepted | 2026-09-27 | — |
| 0004 | Plugin Sandbox with Manifest Verification | Accepted | 2026-09-27 | — |
| 0005 | Interlink At-Most-Once Protobuf Relay | Accepted | 2026-09-19 | — |
| 0006 | i18n Contract (Namespace=Plugin, en-US Canonical) | Accepted | 2026-09-22 | — |
| 0007 | Observability Stack (OTel+Prometheus+Pino) | Accepted | 2026-09-27 | — |

## Process

See [CONTRIBUTING.md](CONTRIBUTING.md) for when and how to create new ADRs.

## Tooling

Currently **no tooling** — ADRs are plain markdown files maintained by hand.
This matches practice in surveyed Discord bot projects (shardix, trophy-bot, caraka).
We will evaluate `adr-tools` or similar only if ADR count exceeds 20.