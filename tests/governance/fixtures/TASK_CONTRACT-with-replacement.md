# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-001 | completed | REQ-001@2 | AC-002 | Run strict doctor against the base fixture. |

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-002 | AC-002 | REQ-001@2 | command:node scripts/doctor.mjs --strict examples/template-adoption/base-minimal | passing | 2026-07-13 |
