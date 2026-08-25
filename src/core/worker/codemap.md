Responsibility
The worker directory provides process isolation for plugins by spawning dedicated child processes, managing plugin lifecycles, enforcing capability-based security via a manifest, handling crash recovery with supervisory host, and facilitating RPC communication between host and child.

Design
- Supervisor pattern: WorkerHost supervises plugin child processes, tracking crashes and enforcing restart backoff.
- Capability-based security: PluginManifest validates declared capabilities against a known set; WorkerHost filters requested capabilities and logs high-risk grants.
- RPC abstraction: rpc.js implements request/response messaging with correlation IDs, size limits, and serialization helpers.
- Lifecycle messaging: workerChild.js translates IPC messages into plugin method calls (load, enable, command, event, unload) and sends responses.
- Factory pattern: Plugin loading via dynamic import of plugin.js with cache‑busting query string.
- Resource limits: WorkerHost applies V8 resource limits from manifest (maxOldGenerationSizeMb, maxYoungGenerationSizeMb, stackSizeMb).
- Circuit breaker: Disables plugins after consecutive crash threshold (default 5), emitting security events.
- Health recovery: markHealthy resets crash count after a healthy window or first crash.

Flow
1. Host invocation: Plugin manager calls WorkerHost.startPlugin with plugin metadata.
2. Process spawn: Host forks workerChild.js, setting environment variables (plugin ID, directory, granted capabilities) and applying resource limits.
3. IPC establishment: Child inherits stdio; sends/receives JSON messages over process.send.
4. Plugin load: Child dynamically loads plugin.js, instantiates class, and awaits lifecycle:load request.
5. Runtime interaction: Host sends RPC requests (e.g., command:run) via WorkerHost.send; child routes to plugin method, returns result.
6. Crash handling: Child process exit triggers WorkerHost.recordCrash; increments counter, logs, possibly disables plugin, schedules restart with exponential backoff.
7. Health recovery: Periodic markHealthy resets crash count after healthy window (10 ms) or after first crash.
8. Shutdown: Host sends lifecycle:unload before terminating child.

Integration
Dependencies:
- node:child_process (fork)
- node:fs/promises (readFile in pluginManifest)
- node:path, node:url (path resolution)
- ../../utils/logger.js (logger in workerChild)
- ../../utils/securityLog.js (security event logging)

Consumers:
- src/core/pluginManager.js (invokes startPlugin/stopPlugin)
- src/core/index.js (bootstraps worker host on startup)
- Test suites in src/core/worker/*Test.js (if present)