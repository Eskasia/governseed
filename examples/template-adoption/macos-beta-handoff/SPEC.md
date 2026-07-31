# SPEC.md

## Scope

- macOS beta handoff package and TCC validation.

## Non-goals

- No public store release.
- No new features.
- No crash reporter integration.

## User flows

1. The tester downloads the app.
2. The tester moves it to the designated path.
3. The tester grants permissions and completes the core operation.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-201@1 | add | must | The beta app launches from the documented fixed path and exposes both permission states. | SRC-201 | release-owner-role | n/a |
| REQ-202@1 | add | redline | Bundle identity and signing identity must not change without a handoff update. | SRC-202 | tester-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-201 | REQ-201@1 | Yes if fixed-path launch succeeds and both permission states are visible; no otherwise. | Launch fails or a permission state cannot be observed. |
| AC-202 | REQ-202@1 | Yes if recorded identities match the handoff; no otherwise. | Bundle or signing identity changes without a handoff update. |

## Edge cases

- Permissions left over from an old bundle id.
- The tester launches the app from Downloads.

## Failure conditions

- The bundle id or signing identity changes after a rebuild without the document being updated.

## Open questions

- Is verification on a clean user account required?

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved tester-environment choices as not-stated rows in `OPEN_LOOPS.md`.
