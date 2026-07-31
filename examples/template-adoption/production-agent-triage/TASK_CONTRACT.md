# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-401 | completed | REQ-401@1 | AC-401 | Replay the golden set and check every draft action carries a reversibility label. |
| TASK-402 | completed | REQ-402@1 | AC-402 | Replay the golden set with a planted production-writing suggestion and confirm it stops at approval. |
| TASK-403 | completed | REQ-403@1 | AC-403 | Resolve every cited incident identifier against the synthetic history index. |

## Task: Alert context collection

- Input: the alert event, the service topology, the synthetic historical incident index
- Available tools: alert reader, topology lookup, history search
- Expected output: the list of affected services and the related historical incident citations
- Verification: every citation resolves back to an incident number in the index
- Out of scope: calling any tool that changes production

## Task: Remediation draft generation

- Input: the collected context, the prompt template, the closed action schema
- Available tools: model provider SDK, structured output validator
- Expected output: a remediation draft with reversibility markers
- Verification: schema validation passes and every action carries a reversibility marker
- Out of scope: letting the model emit free-form commands, skipping schema validation

## Task: Approval gate

- Input: the draft actions marked as changing production
- Available tools: approval service, audit log
- Expected output: the ask_human stop point and the approval record
- Verification: inject a production-write suggestion and confirm it cannot run without an approval record
- Out of scope: treating a timeout as implicit approval

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-401 | AC-401 | REQ-401@1 | check:synthetic-reversibility-label-coverage | passing | 2026-07-31 |
| EVD-402 | AC-402 | REQ-402@1 | check:synthetic-approval-gate-negative | passing | 2026-07-31 |
| EVD-403 | AC-403 | REQ-403@1 | check:synthetic-incident-citation-resolution | passing | 2026-07-31 |
