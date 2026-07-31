# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-001 | completed | REQ-001@1 | AC-001 | Run the antigravity smoke script against a freshly generated project. |
| TASK-002 | completed | REQ-002@1 | AC-002 | Parse every shipped SKILL.md frontmatter in the governance test suite. |
| TASK-003 | completed | REQ-003@1 | AC-003 | Review fixture wording against the published claim boundary. |

## Task details

### Task: Build the antigravity fixture

- Input: base profile, fixed templates, the `.agents/` produced by `init --agent antigravity`
- Available tools: scripts/init.mjs, scripts/doctor.mjs, scripts/smoke-antigravity.mjs
- Expected output: filled antigravity-base fixture with its generated runtime adapter
- Verification: compare generated runtime files with the checked-in fixture, then compare doctor JSON with expected output
- Out of scope: do not hand-edit `.agents/`; regenerate it instead
- Done criteria: fixture status is ready and the smoke script reports no difference
- Risk / blocker: adapter content changes require regenerating this fixture in the same commit

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-001 | AC-001 | REQ-001@1 | command:node scripts/smoke-antigravity.mjs | passing | 2026-07-31 |
| EVD-002 | AC-002 | REQ-002@1 | command:node --test tests/governance/antigravity-runtime.test.mjs | passing | 2026-07-31 |
| EVD-003 | AC-003 | REQ-003@1 | command:node scripts/doctor.mjs --strict examples/template-adoption/antigravity-base | passing | 2026-07-31 |

## Acceptance summary

- [x] Every task verification has been run
- [x] No unrecorded out-of-scope change
- [x] OPEN_LOOPS.md is up to date
