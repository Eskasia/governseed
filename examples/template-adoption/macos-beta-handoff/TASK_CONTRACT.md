# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-201 | completed | REQ-201@1 | AC-201 | Run fixed-path launch and permission-state checks. |
| TASK-202 | completed | REQ-202@1 | AC-202 | Compare synthetic package identity evidence with the handoff. |

## 任務：macOS beta tester handoff

- 輸入：SPEC、MACOS_RELEASE_CHECKLIST、TESTER_HANDOFF
- 可用工具：codesign、spctl、manual tester flow
- 預期輸出：beta handoff package and checklist
- 驗證方式：fixed path launch、TCC permission checks、tester report format
- 不做事項：new feature work、App Store release

## 任務：First-run permission QA

- 輸入：MACOS_RELEASE_CHECKLIST、TESTER_HANDOFF、TECH_STACK
- 可用工具：tccutil reset、codesign、manual tester account
- 預期輸出：privacy-safe first-run QA notes and permission prompt results
- 驗證方式：fresh account launch shows expected prompts and app remains usable after granting permissions
- 不做事項：notarization automation、auto-update channel、crash reporting backend

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-201 | AC-201 | REQ-201@1 | check:synthetic-fixed-path-permission-smoke | passing | 2026-07-13 |
| EVD-202 | AC-202 | REQ-202@1 | check:synthetic-package-identity | passing | 2026-07-13 |
