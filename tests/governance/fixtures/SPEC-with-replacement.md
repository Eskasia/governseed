# SPEC.md

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-001@1 | add | must | Strict doctor reports the filled base fixture as ready. | SRC-001 | maintainer-role | n/a |
| REQ-001@2 | replace | must | Strict doctor reports the filled base fixture as ready with complete lineage. | SRC-002 | maintainer-role | REQ-001@1 |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-002 | REQ-001@2 | Yes if strict doctor exits zero with no warnings; no otherwise. | Strict doctor exits non-zero or reports a warning. |

## Rules

- Requirement rows are append-only; replacement preserves `REQ-001@1`.
