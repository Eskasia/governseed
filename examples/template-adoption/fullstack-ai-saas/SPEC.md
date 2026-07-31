# SPEC.md

## Scope

- Build a tenant-aware RAG preview.
- Support document upload, questions, and citation display.

## Non-goals

- No production billing.
- No external OAuth.
- No bulk data migration.

## User flows

1. The owner creates a workspace.
2. A member uploads a document.
3. A member asks a question and inspects the cited source.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-101@1 | add | must | Each answer displays at least one citation or an explicit fallback. | SRC-101 | product-owner-role | n/a |
| REQ-102@1 | add | redline | A query must never return a document from another workspace. | SRC-102 | security-reviewer-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-101 | REQ-101@1 | Yes if every answer shows a citation or explicit fallback; no otherwise. | An answer has neither a citation nor fallback. |
| AC-102 | REQ-102@1 | Yes if cross-workspace retrieval returns no document; no otherwise. | A document from another workspace is returned. |

## Edge cases

- An empty document.
- No retrieval results.
- A user accesses a document across tenants.

## Failure conditions

- An answer has no citation.
- The tenant filter is not applied before retrieval.

## Open questions

- Does the first release need PDF OCR?

## Lineage rules

- Requirement rows are append-only; replacement and withdrawal preserve prior revisions.
- Not-stated product choices remain in `OPEN_LOOPS.md` until a confirmed source resolves them.
