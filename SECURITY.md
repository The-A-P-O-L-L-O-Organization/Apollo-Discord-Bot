# Security Policy

This policy explains how Apollo handles vulnerabilities, which versions receive fixes, secure deployment requirements, contributor obligations, current technical controls, known trust boundaries, and CI enforcement. Read it before deploying, contributing, operating infrastructure, or handling incident response.

## Table of Contents

- [1. Supported Versions](#1-supported-versions)
- [2. Reporting a Vulnerability](#2-reporting-a-vulnerability)
- [3. Response Process and SLAs](#3-response-process-and-slas)
- [4. Operator Security Baseline](#4-operator-security-baseline)
- [5. Secret and Credential Management](#5-secret-and-credential-management)
- [6. Database Security](#6-database-security)
- [7. Redis and Queue Security](#7-redis-and-queue-security)
- [8. Discord and Application Permissions](#8-discord-and-application-permissions)
- [9. Plugin Supply-Chain Security](#9-plugin-supply-chain-security)
- [10. Interlink Security](#10-interlink-security)
- [11. Webhook and Integration Security](#11-webhook-and-integration-security)
- [12. Secure Coding Requirements](#12-secure-coding-requirements)
- [13. Logging, Retention, and Privacy](#13-logging-retention-and-privacy)
- [14. Infrastructure and Container Security](#14-infrastructure-and-container-security)
- [15. CI and Supply-Chain Enforcement](#15-ci-and-supply-chain-enforcement)
- [16. Known Limitations and Trust Boundaries](#16-known-limitations-and-trust-boundaries)
- [17. Resources and Contact](#17-resources-and-contact)

## 1. Supported Versions

Apollo v3 is the active TypeScript line. Only the latest `main` branch receives security fixes.

| Version | Status |
|---------|--------|
| v3.x on `main` | Supported; security fixes land here |
| v2.x and earlier | Unsupported; upgrade to v3 before requesting fixes |
| Tagged container `latest` | Supported while built from supported `main` |
| Forks and third-party images | Unsupported unless maintained from current `main` |

Do not run production bots on stale tags, unmaintained forks, or pre-TypeScript layouts. Upgrade guidance lives in [INSTALLATION.md](INSTALLATION.md).

## 2. Reporting a Vulnerability

### Use private channels only

1. Do not open public issues for suspected vulnerabilities.
2. Do not open public pull requests with exploit details or proof-of-concept payloads.
3. Do not disclose the issue in Discord servers, forums, or social channels.
4. Use GitHub private security advisories as the preferred channel.
5. If advisories are unavailable, contact maintainers privately and request a secure follow-up channel.

### Include in the report

- Affected component and version or commit SHA
- Vulnerability type and impact assessment
- Complete reproduction steps, including configuration and run mode
- Relevant logs with secrets redacted
- Affected deployment topology: single instance, gateway plus worker, sharded, containerized, Kubernetes
- Suggested fix or mitigation where known
- Whether exploit requires owner, administrator, moderator, ordinary member, or unauthenticated remote access

A minimal report that only states that something looks unsafe cannot be triaged efficiently. Reproduction detail materially shortens response time.

## 3. Response Process and SLAs

Maintainers target the following handling for valid reports:

1. **Acknowledgment**: within 24 to 48 hours.
2. **Initial assessment**: within 3 to 5 business days, including severity and affected versions.
3. **Remediation plan**: patch, configuration change, documentation update, or coordinated disclosure schedule.
4. **Status updates**: while investigation and patching remain active.
5. **Release and advisory**: patched code, updated images where applicable, and public advisory after fixes are available.

Reporters should preserve evidence, avoid accessing other operators' data, avoid destructive testing, and stop testing when asked. Coordinated disclosure protects operators who cannot patch instantly, especially multi-guild production bots.

## 4. Operator Security Baseline

Every deployment must meet this baseline:

- Run current `main` or a recently built supported image.
- Keep Node.js 26, host OS, container runtime, Postgres, and Redis patched.
- Set `NODE_ENV=production` in production.
- Enforce startup guards: valid non-placeholder `DISCORD_TOKEN`, `OPERATOR_AGREEMENT=true`, non-empty `OPERATOR_CONTACT`, and configured `ENCRYPTION_KEY`.
- Restrict owner-only commands through accurate `OWNER_IDS`.
- Use separate Discord tokens, database credentials, Redis passwords, queue HMAC secrets, interlink secrets, webhook secrets, and API keys per environment.
- Never commit `.env`, tokens, private keys, database URLs, or production configuration to version control.
- Review bot permissions quarterly and after every feature installation.
- Monitor logs, `/system` and `/queue` output, queue failure rates, database errors, and authentication failures.
- Maintain tested backups for SQLite files or Postgres snapshots, Redis configuration where durable state matters, `.env` handling procedures, and `plugin-manifest.json` state.

Development conveniences such as `GUILD_ID` command sync, `ALLOW_UNVERIFIED_PLUGINS=1`, verbose logging, and local unsigned plugins must not leak into production.

## 5. Secret and Credential Management

- Store all secrets in environment variables or a secrets manager; never in code, docs, tests, fixtures, or container layers.
- Generate high-entropy secrets:

```bash
openssl rand -base64 32
```

- `ENCRYPTION_KEY` is required and supports rotation as a comma-separated list. Keep the current key first, retain prior keys only until re-encryption completes, then remove them.
- `QUEUE_HMAC_SECRET` should be set in every queued deployment and must match across gateway and workers.
- `APOLLO_SOCKET_TOKEN` should be set whenever Unix socket RPC is reachable by more than the bot user.
- Rotate Discord tokens immediately on suspected exposure through the Developer Portal, then update every affected environment.
- Rotate database passwords, Redis passwords, interlink auth material, webhook secrets, and API keys on employee or contributor offboarding, suspected exposure, or abnormal audit findings.
- Restrict file permissions on `.env`, key files, TLS material, SQLite files, transcripts, and backup archives to the bot user.
- Review shell history, CI logs, screenshots, and issue attachments for accidental secret disclosure.

## 6. Database Security

- Single-instance SQLite deployments must restrict the database file and containing directory to the bot user. SQLite does not support concurrent writers.
- Multi-instance deployments must use PostgreSQL with TLS where available, least-privilege users, strong passwords, and network controls limiting access to bot pods.
- Keep `DB_POOL_MIN` and `DB_POOL_MAX` conservative. Startup validation caps excessive pool maximums near 80 percent of Postgres `max_connections`.
- All application writes must go through `src/utils/db.ts` and Knex migrations. Direct file manipulation, ad hoc SQL against production, or bypassing the adapter is unsupported.
- Migrations in `src/db/migrations/*.cjs` must be reversible and tested on both SQLite and Postgres when shared tables change.
- Encrypt sensitive guild fields through `src/utils/encryption.ts`; do not introduce parallel encryption schemes.
- Honor data deletion and retention obligations. `/datadeletion` paths, ticket transcripts, analytics aggregates, moderation cases, and security logs require careful handling under `legal/PRIVACY.md`.
- Snapshot Postgres before major upgrades. Postgres 18 uses `/var/lib/postgresql`; major upgrades require dump/restore or `pg_upgrade` into a fresh volume.

## 7. Redis and Queue Security

Redis holds queue payloads, distributed locks, spam and raid counters, rate-limit state, pub/sub events, and scheduler coordination. Treat it as sensitive infrastructure.

- Require authentication with `REDIS_PASSWORD` outside local development.
- Isolate environments with separate Redis instances, ACLs, databases, or at minimum distinct `QUEUE_PREFIX` values.
- Keep `QUEUE_HMAC_SECRET` identical across producers and consumers; investigate signature failures as potential tampering or configuration drift.
- BullMQ payloads use serialized interaction subsets. Keep payloads minimal, avoid personal data beyond operational need, and validate reconstructed interactions in workers.
- Spam and raid keys use TTLs; do not disable expiration or persist transient counters.
- Scheduler locks prevent duplicate execution. Do not run schedulers outside `withLock` coordination.
- Monitor Redis memory, eviction, latency, authentication failures, and queue depth. A growing `waiting` backlog can indicate worker outage, credential mismatch, poisoned jobs, or resource exhaustion.

## 8. Discord and Application Permissions

- Invite the bot with least privilege. Grant Manage Messages, Manage Roles, Manage Channels, Kick, Ban, Timeout, and channel management only where server workflows need them.
- Keep owner IDs accurate. `/plugin`, `/system`, `/queue`, `/migrate`, `/interlink`, and global blacklist actions are owner-gated.
- Validate Discord permission checks server-side on every privileged action; client-visible command permissions are UX, not authorization.
- Request only necessary gateway intents. Members and Message Content intents expose sensitive data and should be enabled deliberately.
- Duration strings, snowflake IDs, quantities, channel targets, role targets, and free-text reasons must be validated before use.
- User-facing errors must be safe summaries. Never return stack traces, SQL errors, filesystem paths, Redis errors, token fragments, or upstream API secrets to Discord users.
- Test permission denial paths, including missing bot permissions, hierarchy conflicts such as unmoderatable owners or higher roles, and channel-specific overrides.

## 9. Plugin Supply-Chain Security

Apollo executes powerful automation with first-party and optionally third-party code. The plugin pipeline is therefore a high-value attack surface.

Current controls:

- `plugin-manifest.json` pins SHA-256 hashes for integrity verification.
- `pnpm manifest` regenerates hashes; CI fails on drift.
- `PluginInstaller`, `PluginLoader`, `PluginReloader`, `PluginEnabler`, and `PluginDisabler` isolate lifecycle transitions.
- `pluginSigstore.ts` supports signature verification workflows.
- All third-party plugin installs require Sigstore verification by default via `installPlugin`.
- Installation verifies the whole archive against the signed per-file hash manifest, not just the entry file.
- Plugin capabilities declared in `plugin.json` must be a subset of the signed manifest capabilities.
- Third-party worker plugins execute in sandboxed child processes.
- Capability-gated RPC schemas in `src/core/worker/rpc-schemas.ts` define the only sanctioned host surface.
- `ALLOW_UNVERIFIED_PLUGINS=1` explicitly bypasses verification and warns in production.

Operator and contributor rules:

- Do not enable `ALLOW_UNVERIFIED_PLUGINS=1` in production.
- Review third-party plugin source, permissions, network behavior, persistence behavior, and update cadence before installing.
- Keep `plugin-manifest.json` updates in focused commits and review hash diffs.
- Treat plugin ZIP downloads as untrusted input: validate HTTPS sources, archive paths, sizes, filenames, and extracted permissions.
- Never install plugins from unauthenticated links, shortened URLs without provenance, or archives that cannot be reproducibly sourced.
- Remove unused plugins and rotate related credentials if a plugin is suspected of compromise.

## 10. Interlink Security

Interlink connects independent bots through `services/interlink/`, making authentication and relay compromise especially consequential.

- Treat `INTERLINK_AUTH_KEY` as fully trusted bearer material. Anyone holding it can assert arbitrary bot identities to peers.
- Use dedicated secrets per trust group; do not reuse queue, database, webhook, or session secrets.
- Require JWT secrets of at least 32 characters and keep relay and bot clocks synchronized.
- Enable mTLS with `INTERLINK_TLS_CERT`, `INTERLINK_TLS_KEY`, and `INTERLINK_CA_CERT` for hostile or shared networks.
- Verify advertised Ed25519 identities where peer authentication depends on them.
- Forward only necessary events through `INTERLINK_FORWARD_EVENTS`. Each forwarded event expands data exposure.
- Remember delivery is at-most-once. Do not build safety-critical moderation workflows that assume guaranteed remote delivery.
- Log interlink authentication failures, relay unavailability, schema mismatches, and unexpected peer behavior, and investigate repeated failures promptly.

## 11. Webhook and Integration Security

- GitHub webhooks must verify HMAC signatures against `GITHUB_WEBHOOK_SECRET` before parsing or acting on payloads.
- Preserve raw request bodies through proxies so signature verification receives unaltered bytes.
- Twitch, YouTube, RSS, translation, OpenAI, and NSFW endpoints must use HTTPS and authenticated clients where supported.
- Store integration API keys separately per environment and rotate on quota anomalies or suspected leakage.
- Pollers must remain idempotent and lock-coordinated so duplicate deliveries do not create duplicate announcements.
- Do not echo untrusted external content into Discord without formatting, length limits, mention sanitization, and link review.
- Disable integrations that are not actively used rather than leaving credentials and ports active.

## 12. Secure Coding Requirements

Contributors must follow these rules; reviewers enforce them:

- Validate every Discord option, button payload, modal field, webhook body, queue job, RPC message, config value, and file path.
- Use parameterized database access through Knex and the DB bridge. Raw SQL requires explicit justification and binding.
- Escape or safely construct HTML and markdown in transcript generation, embeds, announcements, and analytics exports.
- Constrain file operations to intended directories. Reject path traversal, absolute-path escapes, oversized uploads, and symlink surprises.
- Enforce HTTPS for plugin downloads and external API calls. Plain HTTP is acceptable only for explicitly local development endpoints.
- Avoid dynamic code execution, unrestricted deserialization, arbitrary module loading, or shell invocation with interpolated input.
- Keep dependencies minimal, review new packages for maintenance and vulnerability history, and use pnpm overrides for pinned security fixes.
- Never add `console.log` for secrets, interaction payloads, message content, user records, or queue internals.
- Add security-relevant tests for authentication, authorization, validation, signature verification, path containment, rate limiting, and error-path non-disclosure.

TypeScript strictness, `no-explicit-any` in `src/`, floating-promise detection, and consistent type imports are security controls, not style preferences. Do not weaken them to silence legitimate warnings.

## 13. Logging, Retention, and Privacy

- Structured logs use pino with sampling via `LOG_SAMPLE_RATE`. Lower sampling only after confirming incident investigation remains possible.
- `SECURITY_LOG_RETENTION_DAYS` defaults to 90 days. Retain security events long enough for incident review while honoring privacy commitments.
- Do not log tokens, secrets, encryption keys, full message content beyond operational need, direct-message text, voice content, or unnecessary personal data.
- Moderation cases, warnings, strikes, tickets, transcripts, analytics, reports, and data-deletion requests contain personal data. Access must be role-limited and purpose-bound.
- Transcript storage is local JSON by default. External upload or long-term archival requires explicit operator configuration and privacy review.
- Before publishing logs for support, redact tokens, secrets, IP addresses where unnecessary, user IDs where unnecessary, guild IDs where unnecessary, and message excerpts.

Operator legal duties live in `legal/TOS.md`, `legal/PRIVACY.md`, and `legal/LEGAL.md`. The bot requires operator agreement at startup because self-hosting makes the operator a data controller for their deployment.

## 14. Infrastructure and Container Security

- Build production from `Dockerfile.prod` and run compiled `dist/index.js`, not live TypeScript sources.
- Prefer pinned image digests for production rollouts over floating `latest`.
- Run containers as a non-root user where supported, with read-only filesystems except for explicitly mounted data volumes.
- Mount only required volumes: SQLite/runtime data and explicitly installed plugins.
- Publish only required ports: health endpoint internally, integration webhook port where configured, and relay ports where required.
- Use network policies or security groups to restrict Postgres, Redis, relay, webhook, and metrics access to authorized pods.
- Configure log rotation for container logs; the Compose file caps JSON logs by size and file count.
- Scan images with Trivy or equivalent before production promotion and review SBOM output for unexpected components.
- Keep host Docker, Compose, Kubernetes, ingress, TLS certificates, and backup systems patched alongside bot dependencies.

## 15. CI and Supply-Chain Enforcement

`.github/workflows/` implements defense in depth:

| Workflow | Security enforcement |
|----------|----------------------|
| `ci.yml` | ESLint, Vitest, coverage, Rust build/test, Go build/test, buf lint, `pnpm audit`, manifest drift |
| `security.yml` | CodeQL, dependency review, SAST |
| `semgrep.yml` | Static-analysis rules for risky patterns |
| `integration-tests.yml` | Redis-backed integration tests with testcontainers |
| `docker.yml` | Image build validation |
| `deploy.yml` | Controlled deployment automation |
| `release.yml` | Release packaging and provenance |
| `setup.yml` | Shared trusted setup |

Additional controls:

- pnpm workspace overrides pin fixes for known vulnerable transitive dependencies.
- `buf lint` and breaking-change detection protect protobuf compatibility.
- Manifest drift detection prevents unreviewed plugin integrity changes.
- SBOM generation and image signing workflows support supply-chain transparency.
- Dependabot or equivalent monitoring should remain enabled.

Security checks are not optional quality gates. Do not bypass failing CodeQL, Semgrep, audit, buf, manifest, or integration findings without a documented risk acceptance and follow-up issue.

## 16. Known Limitations and Trust Boundaries

- A compromised Discord token grants full bot control until rotated. Token theft bypasses application-layer controls.
- A compromised Redis instance exposes queues, locks, counters, pub/sub traffic, and scheduler coordination.
- A compromised Postgres instance exposes guild configuration, moderation history, tickets, analytics, and encrypted fields alongside their key-management risk.
- Anyone holding interlink shared secrets can impersonate trusted bots to peers.
- Leader election has a failover window. During gateway transition, real-time connectivity may briefly drop.
- At-most-once interlink delivery means remote actions cannot be assumed successful without explicit confirmation.
- Sandbox isolation reduces but does not eliminate risk from malicious third-party plugins. Verification, review, and least privilege remain necessary.
- Local SQLite files, transcripts, backups, and socket files are only as secure as host filesystem permissions.
- OpenAI, translation, Twitch, YouTube, GitHub, and NSFW services are external trust boundaries with their own availability, privacy, and abuse considerations.

Design mitigations to fail closed: deny privileged actions on validation failure, preserve audit evidence on errors, avoid destructive defaults, and require explicit operator action for risky operations.

## 17. Resources and Contact

- Discord Developer Portal: <https://discord.com/developers/applications>
- Node.js security: <https://nodejs.org/en/security/>
- OWASP guidance: <https://owasp.org/>
- Redis security: <https://redis.io/docs/management/security/>
- BullMQ connections: <https://docs.bullmq.io/guide/connections>
- Knex raw bindings: <https://knexjs.org/guide/raw.html#raw-param-binding>
- OpenTelemetry security: <https://opentelemetry.io/docs/security/>
- ConnectRPC: <https://connectrpc.com/>

For suspected vulnerabilities, use GitHub private security advisories first and contact maintainers privately as an alternative. For general security questions, review this policy, `README.md`, `INSTALLATION.md`, `CONTRIBUTING.md`, and existing issues before requesting help through normal support channels.

Last updated: 2026.
