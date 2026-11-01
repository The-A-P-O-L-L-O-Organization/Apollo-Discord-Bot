# Task 12 Report: HTTP Transport Decision

## Summary

Benchmarked Node's built-in `fetch` (Undici-backed) against a controlled local HTTP fixture. Apollo's `safeFetch` already owns the security boundary, timeout, DNS, HTTPS, response-size, and error guarantees; the benchmark did not demonstrate a need for direct dispatcher configuration, proxy support, custom CA handling, or per-origin pool limits.

## Benchmark

| Workload | Result |
|---|---:|
| 1,000 sequential requests | 416.05 ms / 2,404 requests/sec |
| 1,000 concurrent requests | 1,282.72 ms / 780 requests/sec |

## Decision

Do not install or expose direct `undici` usage. Node's built-in fetch already uses Undici, and Apollo has no measured transport-level bottleneck or dispatcher-specific requirement. Keep provider code behind `safeFetch` and revisit only with production connection-pool or proxy evidence.
