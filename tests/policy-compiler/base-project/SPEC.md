# SPEC.md

## Scope

The base-minimal fixture demonstrates only the base profile output.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-001@1 | add | must | Strict doctor reports the filled base fixture as ready. | SRC-001 | maintainer-role | n/a |
| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-001 | REQ-001@1 | Yes if strict doctor exits zero with no warnings; no otherwise. | Strict doctor exits non-zero or reports a warning. |
| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |

## Non-goals

- No generated app code.
- No runtime framework.
- No external service configuration.

## Risks

- Fixture drift if base profile required documents change.

## Verification

- `node scripts/doctor.mjs --json examples/template-adoption/base-minimal`

## Lineage rules

- Requirement and acceptance IDs are append-only; replacement or withdrawal preserves earlier rows.
- Active revisions are derived by replay, and not-stated items belong in `OPEN_LOOPS.md`.
