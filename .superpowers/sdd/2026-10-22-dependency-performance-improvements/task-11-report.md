# Task 11 Report: Locale Cache Decision

## Summary

Benchmarked the existing `LocaleCache` under a representative 5,000-entry workload with one million get/set operations and one million deletes. The custom cache already provides the required 5-minute TTL, 5,000-entry cap, LRU promotion, deletion, clearing, and size reporting without an additional dependency.

## Benchmark

Command:

```bash
pnpm exec tsx -e "import { LocaleCache } from './src/i18n/localeCache.ts'; ..."
```

Result on the development worktree:

| Workload | Result |
|---|---:|
| Populate 5,000 entries | 3.62 ms |
| 1,000,000 get/set operations | 451.67 ms |
| 1,000,000 deletes | 103.35 ms |
| Get/set throughput | 2,213,995 operations/sec |

## Decision

Do not install `lru-cache`. Apollo does not currently need stale-while-revalidate, async fetch deduplication, disposal hooks, or a cache API broader than the focused local implementation. Keeping the custom cache avoids migration risk and preserves EventBus invalidation behavior.
