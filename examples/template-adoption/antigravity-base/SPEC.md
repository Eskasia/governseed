# SPEC.md

## Scope

The antigravity-base fixture demonstrates the base profile output plus the
generated Antigravity runtime adapter.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-001@1 | add | must | The checked-in `.agents/` adapter matches what `init --agent antigravity` generates, byte for byte. | SRC-001 | maintainer-role | n/a |
| REQ-002@1 | add | must | Every shipped SKILL.md carries frontmatter whose name matches its directory. | SRC-001 | maintainer-role | n/a |
| REQ-003@1 | add | redline | The fixture must not claim that Antigravity read, loaded, or enforced any generated file. | SRC-002 | maintainer-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-001 | REQ-001@1 | Yes if the smoke script reports no difference between generated and shipped runtime files; no otherwise. | The smoke script names a differing file or file list. |
| AC-002 | REQ-002@1 | Yes if every SKILL.md parses as frontmatter with a matching name; no otherwise. | A SKILL.md has no terminated frontmatter block or a mismatched name. |
| AC-003 | REQ-003@1 | Yes if the fixture states only what was generated; no otherwise. | A document claims runtime enforcement or external adoption. |

## Non-goals

- No generated app code.
- No claim about Antigravity runtime behavior.
- No Antigravity policy materialization; that target has no capability matrix yet.

## Risks

- Adapter drift if `scripts/init.mjs` changes its Antigravity content without updating this fixture.

## Verification

- `node scripts/doctor.mjs --json examples/template-adoption/antigravity-base`
- `node scripts/smoke-antigravity.mjs`

## Lineage rules

- Requirement and acceptance IDs are append-only; replacement or withdrawal preserves earlier rows.
- Active revisions are derived by replay, and not-stated items belong in `OPEN_LOOPS.md`.
