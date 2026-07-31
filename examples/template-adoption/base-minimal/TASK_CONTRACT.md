# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-001 | completed | REQ-001@1 | AC-001 | Run strict doctor against the base fixture. |
| TASK-002 | completed | REQ-002@1 | AC-002 | Inspect generated scope and run fixture validation. |

## Task details

### Task: Build the base fixture

- Input: base profile and fixed templates
- Available tools: scripts/init.mjs, scripts/doctor.mjs
- Expected output: filled base-minimal fixture
- Verification: compare doctor JSON with expected output
- Out of scope: do not add app code
- Done criteria: fixture status is ready
- Risk / blocker: profile changes require expected JSON update

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-001 | AC-001 | REQ-001@1 | command:node scripts/doctor.mjs --strict examples/template-adoption/base-minimal | passing | 2026-07-13 |
| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |

## Acceptance summary

- [x] Every task verification has been run
- [x] No unrecorded out-of-scope change
- [x] OPEN_LOOPS.md is up to date
