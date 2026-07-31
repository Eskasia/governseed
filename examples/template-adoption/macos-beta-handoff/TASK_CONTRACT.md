# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-201 | completed | REQ-201@1 | AC-201 | Run fixed-path launch and permission-state checks. |
| TASK-202 | completed | REQ-202@1 | AC-202 | Compare synthetic package identity evidence with the handoff. |

## Task: macOS beta tester handoff

- Input: SPEC, MACOS_RELEASE_CHECKLIST, TESTER_HANDOFF
- Available tools: codesign, spctl, manual tester flow
- Expected output: beta handoff package and checklist
- Verification: fixed path launch, TCC permission checks, tester report format
- Out of scope: new feature work, App Store release

## Task: First-run permission QA

- Input: MACOS_RELEASE_CHECKLIST, TESTER_HANDOFF, TECH_STACK
- Available tools: tccutil reset, codesign, manual tester account
- Expected output: privacy-safe first-run QA notes and permission prompt results
- Verification: fresh account launch shows expected prompts and app remains usable after granting permissions
- Out of scope: notarization automation, auto-update channel, crash reporting backend

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-201 | AC-201 | REQ-201@1 | check:synthetic-fixed-path-permission-smoke | passing | 2026-07-13 |
| EVD-202 | AC-202 | REQ-202@1 | check:synthetic-package-identity | passing | 2026-07-13 |
