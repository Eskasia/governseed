# SPEC.md

## Scope

-

## Non-goals

-

## User flows

1.
2.
3.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
|  |  |  |  |

## Edge cases

-

## Failure conditions

-

## Open questions

-

## Lineage rules

- Requirement IDs and revisions are append-only. Use `add`, `replace`, or `withdraw`; never delete an old row.
- A `replace` or `withdraw` row supersedes an existing earlier revision of the same requirement. Split intent by withdrawing the old ID and adding new IDs.
- Derive the active revision by replaying the ledger in order. Acceptance criteria reference only active revisions and remain yes/no testable.
- `Class` is `must` or `redline`; every row cites a confirmed `SRC` attestation and its `Confirmed by` value exactly matches that source's role label.
- Keep normalized requirements, criteria, and failure signals non-sensitive. Put anything not stated by a source in `OPEN_LOOPS.md`.
- Every acceptance `(REQ@revision, AC)` pair is consumed by a matching task pair and acceptance-evidence pair.
