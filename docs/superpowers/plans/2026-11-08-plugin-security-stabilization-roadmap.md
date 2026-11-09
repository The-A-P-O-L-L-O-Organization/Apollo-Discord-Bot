# Apollo Discord Bot - Development Roadmap

Proposed implementation plan. Based on the November 6, 2026 repository state (commit `a181c77`; HEAD at time of archiving is `50f35e96`).

The recommendation is to organize Apollo's next development cycle around one overarching objective:

Make Apollo's existing architecture secure, internally consistent, and reliable before expanding its capabilities further.

This is a stabilization and hardening program, not a rewrite. Most of the current architecture is worth preserving.

The repository's latest commit is still `a181c77` in the version this plan was drafted against. This plan addresses the issues identified in the review, with additional acceptance criteria to prevent the same problems from returning.

## 1. Priority overview

The work divides into seven phases.

Phase 0 - Establish a verified baseline

Foundation

Establish reproducible tests, establish security requirements, and verify the current state.

Phase 1 - Critical plugin security fixes

P0

Eliminate secret exposure and establish a trustworthy security boundary.

Phase 2 - Complete the plugin RPC system

P0

Implement the missing host-side RPC dispatcher and enforce capabilities.

Phase 3 - Correct plugin lifecycle and installation

P1

Fix automatic re-enablement, signature verification, and installed-plugin integrity.

Phase 4 - Implement genuine plugin isolation

P0

Introduce operating-system-enforced restrictions and resource limits.

Phase 5 - Repair distributed leader election

P1

Implement correct fencing, ownership verification, and failover.

Phase 6 - Reliability, observability, and cleanup

P2

Improve worker recovery, shutdown, monitoring, documentation, and technical debt management.

The ordering matters. For example, exposing more plugin APIs should not proceed until the host-side authorization system exists.

# 2. Detailed implementation plan

## Phase 0 - Establish a verified baseline

Objective: Make sure subsequent changes are measured against a reliable understanding of Apollo's current behavior.

### Tasks

- Run a clean dependency installation using the committed lockfile.
- Run TypeScript compilation and typechecking.
- Run the complete Vitest suite.
- Run Oxlint with type-aware checks.
- Run Go tests and builds.
- Run Rust tests and builds.
- Run the integration and architecture fitness suites.
- Regenerate `TECHNICAL_DEBT_REPORT.md`.
- Investigate the discrepancy between the debt report's 494 failing tests and the successful November 6 CI run.
- Record the current CI results and commit hash.
- Review the existing threat model against the implementation.

### Important architectural decision

Define exactly what Apollo promises when it says that a third-party plugin is sandboxed.

These explicit security requirements should be established:

1. Plugins must not receive Discord tokens.
2. Plugins must not receive database credentials.
3. Plugins must not receive encryption keys.
4. Plugins must not receive Redis credentials or queue-signing secrets.
5. Plugins must not access unrestricted host filesystem locations.
6. Plugins must not execute unrestricted privileged host operations.
7. Plugins must operate within enforced resource limits.
8. Plugins must communicate with Apollo through an explicitly defined interface.

Completion criteria: A reproducible baseline exists, the CI suite is green, and the security requirements are documented as testable invariants.

## Phase 1 - Critical plugin security fixes

P0 - Highest priority

Objective: Remove the most immediate security weaknesses in the existing plugin runtime.

### 1.1 Eliminate secret exposure

Files:

- `src/core/worker/workerHost.ts`
- `src/core/worker/workerChild.ts`
- `src/core/capabilitySignature.ts` or its current equivalent under `src/core/worker/`

Tasks:

- Remove `QUEUE_HMAC_SECRET` from the worker environment.
- Remove `PLUGIN_CAPABILITY_SECRET` from the worker environment.
- Rework capability verification so plugin code never receives the host's signing secret.
- Keep authoritative capability grants inside the host process.
- Ensure that worker startup does not inherit unrelated host environment variables.
- Audit every environment variable exposed to plugin processes.
- Verify that secrets cannot be retrieved through alternative configuration or filesystem access.

The key architectural principle is:

The host must be the authority that determines what a plugin is allowed to do.

A plugin should never be trusted to enforce its own permissions.

### 1.2 Establish host-side capability enforcement

- Create a centralized capability authorization component.
- Associate every supported host operation with a required capability.
- Validate the requesting worker's identity.
- Reject unauthorized requests.
- Validate payloads before executing host operations.
- Record security-relevant authorization failures.
- Prevent plugins from modifying their effective permissions by changing their local worker-side API objects.

### 1.3 Improve signing trust

- Introduce a clearly defined trusted publisher-key or identity model.
- Never trust a public key merely because it accompanies the signature being verified.
- Keep publisher trust roots outside downloaded plugin archives.
- Ensure production installations fail closed when verification cannot be completed.
- Remove ambiguous development bypass behavior from production configurations.

### 1.4 Security regression tests

Create tests that verify:

- A plugin cannot access queue-signing secrets.
- A plugin cannot access capability-signing secrets.
- A plugin cannot forge its own permissions.
- An unauthorized RPC request is rejected by the host.
- Invalid signatures are rejected.
- Unknown signing identities are rejected.
- Missing security configuration causes the expected failure.

Completion criteria: A deliberately malicious test plugin cannot obtain host secrets or grant itself additional host privileges.

## Phase 2 - Complete the plugin RPC system

P0 - Core architecture

Objective: Make the existing worker-to-host communication architecture functional, secure, and well-defined.

Apollo already has RPC-related components:

- `workerChild.ts`
- `workerHost.ts`
- `WorkerPluginProxy.ts`
- `rpc.ts`
- `rpc-schemas.ts`

Rather than replacing these wholesale, the recommendation is to complete and consolidate them.

### 2.1 Implement the host RPC dispatcher

- Introduce an explicit dispatcher for requests originating from plugin workers.
- Distinguish worker requests from worker responses.
- Route incoming requests to registered host-side handlers.
- Enforce capability authorization before dispatch.
- Validate request payloads with Zod.
- Verify that request identity matches the actual worker connection.
- Return structured responses with matching correlation IDs.
- Reject unknown RPC methods.

### 2.2 Establish the RPC contract

Recommended structure:

```
Plugin Worker
     |
     v
Worker RPC Client
     |
     v
IPC Transport
     |
     v
Host RPC Dispatcher
     |
     +--> Identity Verification
     |
     +--> Capability Authorization
     |
     +--> Payload Validation
     |
     +--> Rate Limiting
     |
     v
Host API Handler
     |
     v
RPC Response
```

Every host operation should have an explicit definition containing:

- Method identifier.
- Required capability.
- Request schema.
- Response schema.
- Timeout.
- Rate limit.
- Error behavior.

### 2.3 Complete the host APIs

Begin with the capabilities already present in the repository:

| Capability         | Expected behavior                                 |
| ------------------ | ------------------------------------------------- |
| `api:sendMessage`  | Send a Discord message through the host           |
| `api:getOwnConfig` | Retrieve the plugin's own permitted configuration |
| `api:setOwnConfig` | Update the plugin's own permitted configuration   |
| `api:commandReply` | Reply to a supported command interaction          |
| `api:i18n`         | Request translations from the host                |

The existing event capabilities should also have documented payload contracts.

### 2.4 RPC reliability

- Add timeouts to both directions of RPC.
- Reject pending promises when a worker exits.
- Add cancellation support where appropriate.
- Limit concurrent outstanding RPC requests.
- Enforce message-size limits.
- Add per-plugin request rate limits.
- Handle worker disconnections without leaving unresolved promises.
- Use structured and consistent RPC errors.

### 2.5 Integration testing

Test complete interactions rather than just individual functions.

For example:

1. Start Apollo's plugin host.
2. Start a test plugin worker.
3. Have the plugin request a translation.
4. Verify the host authorizes the request.
5. Verify the host processes it.
6. Verify the response reaches the correct plugin.
7. Repeat with an unauthorized request.
8. Verify that the unauthorized request is rejected.

Completion criteria: Every advertised host capability has a functioning, end-to-end, authorization-tested RPC implementation.

## Phase 3 - Correct plugin lifecycle and installation

P1 - Functional correctness

Objective: Ensure that plugins behave predictably across installation, startup, shutdown, updates, and removal.

### 3.1 Fix installed-plugin enablement

File: `src/core/PluginManager.ts`

- Separate plugin discovery from plugin activation.
- Separate installation state from enabled state.
- Allow installed plugins to remain disabled.
- Only enable plugins listed in the configuration.
- Preserve disabled states after restarts.
- Respect plugin dependencies during activation.
- Handle dependencies that are installed but disabled.
- Prevent repeated lifecycle calls.

Expected lifecycle:

```
DISCOVERED
    |
    v
INSTALLED
    |
    v
LOADED
    |
    +----> DISABLED
    |
    v
ENABLED
    |
    +----> DISABLED
    |
    v
UNLOADED
    |
    v
UNINSTALLED
```

These states should be explicitly represented rather than inferred from the presence of a plugin directory.

### 3.2 Repair plugin installation

Files:

- `src/core/PluginRegistry.ts`
- `src/core/pluginDownloader.ts`
- `src/core/pluginSigstore.ts`
- `src/core/PluginInstaller.ts`

Tasks:

- Extend registry entries with the necessary trusted publisher information.
- Pass signature metadata through the entire installation pipeline.
- Verify signatures against an independently trusted identity.
- Bind plugin identity and version to the signed release metadata.
- Ensure registry ID, manifest ID, plugin class ID, and installation directory ID match.
- Verify every signed file hash.
- Detect additional unexpected files, not just missing or modified files.
- Reject unsafe paths.
- Verify installed files again before activation.
- Implement safe update and rollback procedures.

The plugin package format, including its versioning and signing requirements, should also be formalized.

### 3.3 Plugin lifecycle regression tests

- Installing a plugin does not automatically imply permanent activation.
- Disabled plugins remain disabled after restart.
- Dependencies are enforced.
- Reloading a plugin does not leave duplicate event registrations.
- Uninstalling terminates the worker before deleting its files.
- Failed installations clean up incomplete directories.
- Tampered installed plugins cannot be activated.

Completion criteria: Installation, activation, deactivation, reload, restart, and uninstall all produce predictable results.

## Phase 4 - Implement genuine plugin isolation

P0 - Security architecture

Objective: Replace the current process-separation-only approach with real operating-system-enforced restrictions.

This is a larger architectural task and deserves its own implementation design before coding begins.

### 4.1 Select the isolation technology

Recommended candidates for evaluation:

- Rootless Podman containers.
- Docker containers with an appropriately restricted runtime.
- Bubblewrap or another Linux namespace-based isolation mechanism.
- A stronger isolation environment, such as gVisor, for deployments with more demanding threat models.

The preferred starting point is rootless container-based isolation, provided the host deployment and operational requirements support it.

A normal Node.js child process alone should not qualify as the security boundary.

### 4.2 Establish the restricted runtime

Each untrusted plugin should receive:

| Resource           | Recommended policy                            |
| ------------------ | --------------------------------------------- |
| Filesystem         | Isolated, minimal access                      |
| Root filesystem    | Read-only                                     |
| Writable storage   | Dedicated plugin storage                      |
| Network            | Disabled by default or explicitly allowlisted |
| Environment        | Minimal, non-sensitive variables              |
| OS identity        | Unprivileged identity                         |
| Linux capabilities | Dropped                                       |
| Process creation   | Restricted                                    |
| Memory             | Enforced limit                                |
| CPU                | Enforced limit                                |
| Process count      | Enforced limit                                |
| IPC                | Explicitly authorized communication only      |

The plugin should communicate with Apollo through the RPC architecture developed in Phase 2.

### 4.3 Repair resource-limit enforcement

Files:

- `src/core/worker/workerHost.ts`
- `src/core/worker/cgroupManager.ts`
- `src/core/worker/pluginManifest.ts`

Tasks:

- Ensure resource limits survive manifest parsing.
- Implement actual cgroup v2 memory restrictions.
- Implement CPU restrictions.
- Add PID/process-count restrictions.
- Distinguish V8 heap limits from total process memory limits.
- Fail closed when required security restrictions cannot be established.
- Implement reliable worker termination.
- Escalate termination when graceful shutdown fails.
- Clean up isolated runtime resources after termination.

### 4.4 Adversarial security testing

Create a dedicated hostile-plugin test suite.

It should test whether a plugin can:

- Access host environment secrets.
- Read files outside its permitted storage.
- Access host configuration.
- Access another plugin's data.
- Access restricted network destinations.
- Exceed enforced memory limits.
- Consume excessive CPU resources.
- Spawn excessive child processes.
- Continue running after termination.

Tests should run in a disposable environment, never against a real production installation.

Completion criteria: Apollo can demonstrate actual isolation properties through adversarial tests, rather than relying on the existence of a worker process.

## Phase 5 - Repair distributed leader election

P1 - High availability

Objective: Ensure that multiple Apollo instances cannot unintentionally operate as gateway leaders simultaneously.

### 5.1 Consolidate leader election

Files:

- `src/gateway/leader.ts`
- `src/gateway/fencing.ts`
- `src/index.ts`

Tasks:

- Make the fencing-token implementation the authoritative leader-election mechanism.
- Remove the unsafe legacy heartbeat path from production startup.
- Implement atomic lock acquisition and fencing-token generation.
- Ensure failed acquisition attempts do not invalidate the current leader's token.
- Verify both pod identity and fencing token during heartbeat renewal.
- Verify both during lock release.
- Ensure Redis Cluster scripts operate on compatible key slots.
- Detect lease loss.
- Immediately stop gateway activity when leadership is lost.
- Ensure a new leader cannot begin until it has successfully acquired leadership.

### 5.2 Implement reliable failover

Desired behavior:

```
          Pod A
            |
            v
      Acquire Leadership
            |
            v
      Become Gateway
            |
            v
       Renew Lease
            |
       +----+----+
       |         |
     Success   Failure
       |         |
       v         v
    Continue   Demote
                 |
                 v
           Stop Gateway
                 |
                 v
           Pod B Acquires
                 |
                 v
           Become Leader
```

### 5.3 Distributed-system testing

- Two pods attempting simultaneous leadership.
- Leader losing Redis connectivity.
- Leader recovering after lock expiration.
- Redis interruption during heartbeat.
- Stale leader attempting to renew an expired lease.
- New leader acquiring an expired lease.
- Graceful leader shutdown.
- Forced leader termination.
- Redis restart during active leadership.

Importantly, fencing tokens must protect downstream operations where applicable. A token that is generated but never enforced does not provide complete fencing.

Completion criteria: Failover tests demonstrate correct ownership and that a stale leader cannot continue operating as an active gateway.

## Phase 6 - Reliability, observability, and technical debt

P2 - Long-term stability

Objective: Make Apollo easier to operate, debug, maintain, and extend.

### 6.1 Improve worker supervision

Files:

- `src/core/worker/workerHost.ts`
- `src/core/PluginManager.ts`
- `src/core/WorkerPluginProxy.ts`

Tasks:

- Connect worker crash events to the plugin manager.
- Wire `onScheduleRestart` into a real restart scheduler.
- Wire `onPluginDisabled` into plugin lifecycle management.
- Add exponential backoff with jitter.
- Reset crash counters after a genuinely healthy operating period.
- Distinguish intentional termination from unexpected crashes.
- Add operator notifications for repeated plugin failures.
- Prevent multiple simultaneous restart attempts.
- Clean up outstanding RPC requests when a worker terminates.

### 6.2 Improve shutdown and startup

Files:

- `src/index.ts`
- `src/core/PluginManager.ts`

Tasks:

- Await plugin deactivation during shutdown.
- Ensure all worker processes terminate.
- Close outstanding RPC connections.
- Close Redis, PostgreSQL, and queue connections in a controlled order.
- Ensure health endpoints report shutdown and readiness accurately.
- Prevent partially initialized plugins from remaining active.
- Add tests for startup failure at each major initialization stage.
- Test graceful and forced termination.

### 6.3 Improve observability

Tasks:

- Add plugin-specific metrics.
- Measure RPC request latency.
- Track authorization failures.
- Track worker restarts.
- Track resource-limit violations.
- Track plugin activation failures.
- Track gateway leadership changes.
- Add distributed tracing across gateway, queue, worker, and interlink services.
- Expose meaningful health and readiness indicators.

Suggested metrics:

| Metric                                    | Purpose                  |
| ----------------------------------------- | ------------------------ |
| `apollo_plugin_worker_restarts_total`     | Worker restart frequency |
| `apollo_plugin_rpc_requests_total`        | RPC usage and outcomes   |
| `apollo_plugin_rpc_duration_seconds`      | RPC latency              |
| `apollo_plugin_capability_denials_total`  | Authorization failures   |
| `apollo_plugin_resource_violations_total` | Resource enforcement     |
| `apollo_gateway_leadership_changes_total` | Leadership transitions   |

These names are proposals, not claims that the metrics already exist.

### 6.4 Reduce architectural debt

The most important structural improvements:

- Establish a canonical capability registry instead of maintaining duplicated capability lists.
- Split `EventBus` responsibilities into clear internal components where necessary.
- Continue decomposing `PluginManager` as its responsibilities evolve.
- Break down oversized utility and shared-type files when there is a concrete maintenance benefit.
- Review synchronous filesystem operations in asynchronous execution paths.
- Align dependency versions across package definitions and workspace catalogs.
- Establish automated dependency-update procedures.
- Improve test coverage for database migrations and cross-pod events.

Splitting every large file immediately is not a priority. Security and behavioral correctness should come before purely cosmetic refactoring.

### 6.5 Documentation and release engineering

- Update README commands to reflect Oxlint.
- Update the installation documentation.
- Document the actual plugin trust and isolation model.
- Document the RPC contract.
- Document resource-limit behavior.
- Document distributed deployment requirements.
- Regenerate the technical debt report.
- Ensure documented security guarantees correspond to tested properties.
- Review Docker Compose defaults for exposed production deployments.
- Add regression tests for configuration validation.

Completion criteria: Operators can understand Apollo's health, identify plugin failures, deploy it securely, and maintain it without relying on undocumented assumptions.

# 3. Release gates

Formal release gates should be introduced so that completing a collection of tasks does not automatically imply that Apollo is ready for production.

Gate A - Plugin security

- No host signing or queue secrets exposed to plugin workers.
- Host-side capability authorization works.
- Signature verification uses trusted publisher identities.
- No unauthorized filesystem or network access through the supported isolation boundary.

Gate B - Plugin functionality

- RPC requests work end to end.
- Disabled plugins remain disabled after restart.
- Plugin installation and verification work.
- Plugin reload and removal are safe.
- Failed workers are handled correctly.

Gate C - Distributed reliability

- Fencing is integrated into production startup.
- Stale leaders lose their operational role.
- Redis partition and failover tests pass.
- Graceful shutdown works.

Gate D - Engineering quality

- Complete CI suite passes.
- Typechecking and linting pass.
- Integration tests pass.
- Security regression tests pass.
- Technical debt report is current.
- Documentation matches implementation.

An important restriction: Apollo should not advertise arbitrary third-party plugin hosting as securely supported until Gate A is satisfied. A separate process is useful isolation, but it does not meet that security requirement by itself.

# 4. Recommended implementation sequence

Although the phases are numbered, some work can run in parallel.

The sequence for actual development:

| Order | Deliverable                                   | Depends on     |
| ----- | --------------------------------------------- | -------------- |
| 1     | Baseline tests and threat model               | Nothing        |
| 2     | Remove host secret exposure                   | 1              |
| 3     | Host-side capability authorization            | 2              |
| 4     | Complete RPC dispatcher                       | 3              |
| 5     | Fix plugin enablement and lifecycle           | 1              |
| 6     | Repair signatures and installation integrity  | 2              |
| 7     | Design and implement OS isolation             | 2, 3, 4        |
| 8     | Implement enforced resource limits            | 7              |
| 9     | Replace legacy leader election with fencing   | 1              |
| 10    | Worker recovery and shutdown reliability      | 4, 5, 7        |
| 11    | Observability and technical debt improvements | Earlier phases |
| 12    | Full security and release validation          | All phases     |

The OS-isolation design and distributed-systems work should be kept in separate branches or workstreams where practical, because they address different architectural concerns.

## 5. What should not be prioritized yet

Deliberately postponed:

- Adding more first-party plugins.
- Adding additional plugin capabilities.
- Expanding the interlink service with more functionality.
- Introducing additional database adapters.
- Large-scale cosmetic refactoring.
- Introducing more distributed services without a demonstrated need.
- Adding more sophisticated plugin marketplace functionality.

These are not necessarily bad ideas. They simply do not address Apollo's most important current weaknesses.

# 6. The first development milestone

The first milestone:

Milestone 1

# Plugin Security and Runtime Correctness

Objective: Establish a trustworthy plugin execution architecture.

Deliverables:

1. No host secrets exposed to plugin workers.
2. Host-side capability authorization.
3. A functional, validated RPC dispatcher.
4. Correct plugin enablement persistence.
5. Trusted plugin signatures and integrity verification.
6. A documented OS isolation design.
7. Automated security regression tests.

Exit condition: Apollo can demonstrate that a plugin cannot obtain host secrets or perform unauthorized host operations.

The plugin ecosystem should not be expanded until this milestone is complete.

Overall recommendation: Make the next development cycle about making Apollo's architecture trustworthy rather than making it larger. The existing design is ambitious enough; it needs stronger implementation guarantees now.

A useful ongoing safeguard is a weekly review of Apollo's commits, outstanding work, and completed milestones to keep this roadmap synchronized with development.

# 7. Verification record

Verified: 2026-11-08. HEAD at verification: `50f35e96` (plan drafted against `a181c77`).

## Confirmed claims

Major claims were confirmed against current code:

- Secret exposure: `workerHost.ts:271-277` passes both `QUEUE_HMAC_SECRET` and `PLUGIN_CAPABILITY_SECRET` into the worker child env; `workerChild.ts:64` reads them in-process, so plugin code holding the host's signing secret can re-sign any capability set. Phase 1 stands as written.
- Missing host RPC dispatcher: confirmed. Child-initiated `rpc:request` messages reach `workerHost.handleChildMessage` (`workerHost.ts:311-318`), which only matches `lifecycle:ready` and otherwise re-emits; nothing in production answers `kind: 'request'`. Worker-originated calls hang forever. `api:i18n` has a functioning host implementation (`workerHost.handleI18nCall`, capability-checked) that is never wired to the IPC loop; `api:sendMessage`, `api:getOwnConfig`, `api:setOwnConfig`, `api:commandReply` are declared in three capability lists but have no implementations. Phase 2 stands as written, with `api:i18n` noted as partially implemented.
- Lifecycle: confirmed. Install pushes into `config.plugins.enabled` and immediately loads (`PluginManager.ts:347-352`); `loadAll` re-activates every installed plugin on restart regardless of enablement (`PluginManager.ts:108-121`); `disablePlugin` only mutates memory and nothing persists `plugins.disabled` (a schema field exists with zero consumers). No explicit lifecycle-state model exists anywhere. Phase 3.1 stands as written.
- Installation integrity: confirmed. `verifyArchiveIntegrity` (`PluginInstaller.ts:21-31`) checks only manifest-listed files, has no extra-file scan or traversal containment (traversal is checked only in the extractor), and installed files are never re-verified before activation. Sigstore verification never binds to a trusted publisher identity: `pluginSigstore.ts:188-191` falls back to the bundle's own `publicKey` and self-verifies. One correction: the key comes from the registry entry or the sigstore bundle, not literally from the downloaded zip archive; the defect is self-key trust, carrying over from the design in `2026-10-08-plugin-security-audit-fixes.md`.
- Leader election: confirmed. `src/index.ts` imports and uses only the legacy token-free path (`acquireGlobalLock`, `startHeartbeat`); `acquireGlobalLockWithFencing` has zero production callers. `verifyFencingToken` is called nowhere outside tests. On failed renewal the result of `SET XX` is discarded and gateway activity continues; the fencing heartbeat stops silently without demoting. The fencing Lua scripts touch `KEYS[1]` and `KEYS[2]` with keys sharing no hash tag, raising `CROSSSLOT` on Redis Cluster, which this deployment supports. Heartbeat renewal checks pod identity only; the release script checks the token.
- Resource limits: confirmed in substance. `parsePluginManifest` (`pluginManifest.ts:45-57`) drops `resourceLimits`, so installed plugins never receive limits at `startPlugin`; the enforcement machinery itself (V8 flag plus cgroup v2 `memory.max`/`cpu.max` and proc attach) is real. No PID limits exist anywhere. The host fails open when cgroups are unavailable. Workers are plain `child_process.fork`; no namespace or container isolation exists.
- Worker termination: confirmed. `terminateWorker` (`workerHost.ts:365-379`) sends SIGTERM only; no SIGKILL escalation exists in `src/`, and workers are deleted from maps regardless of kill success.
- Worker supervision: confirmed that `onScheduleRestart` and `onPluginDisabled` are declared in `workerHost.ts:84-85` and invoked but never assigned anywhere, so crashes never schedule restarts. Corrected: crash counters are already reset after half-open success and after a ten-minute healthy window (`recordSuccess`, `workerHost.ts:166-197`), so that Phase 6 task is already satisfied.
- Debt report: `TECHNICAL_DEBT_REPORT.md` (dated 2026-11-06) does report 494/1682 failing tests (single root cause: the i18next v26 `fixedT` breakage), while CI runs through 2026-11-07 are green. The Phase 0 discrepancy investigation task is therefore accurate and important.
- Linting: `pnpm lint` runs `oxlint --type-aware --type-check` (`package.json:37`); README and CONTRIBUTING still describe ESLint. Phase 6.5 stands.
- Metrics: none of the six proposed metric names exist today (confirmed touchpoints: only a boolean leader gauge in `src/utils/metrics.ts`).
- Shutdown: partially confirmed. Plugin deactivation at shutdown is fire-and-forget (`src/index.ts:344-346`), `client.destroy()` is not awaited, the health server stops after data-plane closures with no draining state, and workers only receive the unawaited SIGTERM racing `process.exit(0)`. Corrected in part: Redis, database, and queue connections are closed in a defined sequential order (`src/index.ts:351-363`), so that Phase 6 task is already satisfied.

## Carried corrections for implementation

- The "ensure that worker startup does not inherit unrelated host environment variables" task (1.1) is already satisfied: worker start replaces inheritance with an explicit six-key env map. The audit task should focus on those six keys, of which two contain host secrets.
- Add to Phase 6: crash-counter reset already exists; wire-up and a scheduler with backoff are missing.
- The heartbeat path should verify the fencing token, not just release-path verification.
