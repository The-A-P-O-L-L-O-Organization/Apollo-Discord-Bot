# ADR Contribution Guide

## When to Write an ADR

Create an ADR when a decision meets **any** of these criteria:

1. **New trust boundary** — Adding a new external dependency, service, or integration point
2. **Irreversible technology choice** — Database, queue, RPC framework, language runtime
3. **Architectural pattern adoption** — CQRS, event sourcing, plugin architecture changes
4. **Security model change** — New threat boundary, capability system, encryption scheme
5. **Cross-team/cross-process impact** — Changes affecting gateway/worker contract, plugin API, interlink protocol

**Do NOT** create ADRs for:
- Bug fixes
- Refactoring within existing patterns
- Configuration changes
- Dependency version bumps (unless major version with breaking changes)

## How to Create an ADR

1. Copy `0000-template.md` to `NNNN-short-title.md` (next sequential number)
2. Fill in all four MADR sections: Status, Context, Decision, Consequences
3. Set Status to `Proposed` initially
4. Link related issues/PRs/plans in References
5. Update `README.md` index table
6. Submit PR for review
7. On merge, update Status to `Accepted` and Date to merge date

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| `Proposed` | Under discussion; not yet agreed |
| `Accepted` | Agreed and implemented (or will be) |
| `Superseded` | Replaced by newer ADR (link in References) |
| `Deprecated` | No longer relevant; not replaced |

## Superseding an ADR

1. Create new ADR with `Status: Proposed`
2. In new ADR References: `Supersedes: NNNN`
3. In old ADR: Update Status to `Superseded`, add `Superseded by: NNNN` in References
4. Update README index

## Style Notes

- Keep Context factual — describe forces, not opinions
- Decision uses active voice: "We will use X" not "X should be used"
- Consequences must include at least one negative/neutral entry (no perfect decisions)
- One ADR per decision; don't bundle unrelated choices
- Target <500 words per ADR