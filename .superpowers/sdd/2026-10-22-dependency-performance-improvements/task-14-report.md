# Task 14 Report: HTTP Benchmarking Decision

## Decision

Do not add `autocannon`. A controlled Node fixture benchmark already measured sequential and concurrent HTTP throughput without production credentials or side effects. Adding a second benchmark generator would not improve current evidence; future HTTP work can add a development-only harness if Apollo exposes a larger public HTTP surface or needs repeatable percentile comparisons.
