# Task 3 Report: Replace regex RSS/Atom parsing

## Status
Implemented Task 3 in the dependency-performance-improvements worktree.

## Changes

- Added `fast-xml-parser` 5.11.2 as a production dependency through the workspace catalog.
- Replaced regex-based RSS/Atom parsing in `src/utils/integrationClients.ts` with `XMLParser` and `XMLValidator`.
- Preserved the existing `checkRssFeed(feedUrl): Promise<RssFeedResult | null>` contract and RSS circuit-breaker behavior.
- Kept `safeFetch()` as the only network boundary, including its HTTPS, DNS-rebinding, timeout, and response-size safeguards. No `safeFetch` change was required.
- Configured bounded parser behavior with namespace-prefix removal, entity processing, trimmed values, disabled implicit numeric conversion, and a maximum nested-tag depth.
- Added a private normalization layer for RSS and Atom shapes, including:
  - RSS 2.0 `channel.item` and Atom `feed.entry` handling.
  - Atom `link href` and alternate-link selection.
  - RSS GUID and Atom ID fallback to the item link.
  - Atom `published` fallback to `updated`.
  - CDATA, entities, namespaces, multiline values, missing fields, empty feeds, and malformed XML.
- Parser-specific objects and raw XML are not exposed through the public result shape.

## Tests

Passed:

- `pnpm vitest run tests/utils/integrationClients.test.ts tests/utils/integrationPoller.test.ts tests/utils/integrationFormatters.test.ts`
  - 3 test files passed
  - 20 tests passed
- `pnpm lint`
  - Passed with existing repository warnings
- `pnpm build`
  - Passed
- `pnpm audit --audit-level=moderate`
  - No known vulnerabilities

`pnpm typecheck` remains failing on the repository's pre-existing unrelated test/type errors. The changed production source has no type errors; `pnpm build` passes. No unrelated cleanup was performed.

## Review notes

- Existing RSS/Atom result fields remain exactly `feedTitle`, `items`, `title`, `link`, `guid`, and `pubDate`.
- Missing RSS GUIDs and Atom IDs now produce stable link-based identifiers for compatibility with `integrationPoller.ts` deduplication.
- Malformed XML is validated and contained by the existing `checkRssFeed` error path, returning `null` without returning parser internals or raw document content.

## Commit

Task 3 commit created after self-review.
