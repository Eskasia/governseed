# AGENT_RUNTIME.md

## Agent Goal

- Users:
- Work to complete:
- Out of scope:

## Trigger Entry

- UI:
- cron:
- webhook:
- Slack / Gmail / connector:
- CLI / manual:

## State

- Business state:
- Execution state:
- Storage location:
- Rebuildable from events:

## Event

- Event types:
- Event sources:
- Advance rules:

## Context Window

- Format:
- Sources:
- Compaction method:
- Must not contain:

## Prompts

- Prompt template location:
- Approved prompt-template version:
- privacy-safe trace metadata:
- Change rules:
- Must not retain: private prompt text, masked private excerpts, or copies of the runtime prompt.

## Structured Outputs

- action schema:
- done / pause / ask_human:
- invalid output handling:

## Evidence Persistence

- May retain: normalized closed-schema evidence that passed the validator and the privacy scanner.
- Must not retain: raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, raw diff hunks.
- Real mode: governance-impact accepts only clean, committed synthetic scenarios; runtime proof uses only generated synthetic fixtures.
- Fail closed: when the scanner, output schema, session persistence, or cleanup cannot be proven safe, return a stable code and produce no artifact.
- Cleanup-before-persist: terminate and reap children, remove the isolated HOME/TMP/workspace, confirm nothing is left behind, then persist evidence atomically.
- Claim boundary: runtime proof establishes only the entrypoint first-response contract; only the governance-impact evaluator may state delivery impact, and only after an independent evidence gate.
- Current evaluator capability: a Codex real run is refused because detached / re-parented descendant containment is unproven; Claude is refused because workspace containment is unproven; Antigravity is unavailable without its binary, and even with the binary must first prove non-persistence and containment.

## Tools

| Tool | Permission | Side effect | idempotency | rollback |
|---|---|---|---|---|

## Control Flow

- Program-controlled:
- Model-judged:
- Max steps:

## Human Approval

- Actions that must ask a human:
- approver:
- timeout:
- fallback:

## Launch / Pause / Resume

- launch:
- pause:
- resume:
- retry:
- cancel:

## Error Compaction

- Error sources:
- Compaction format:
- Retry limit:

## Verifier

- tests:
- eval:
- replay:
- E2E:
- Manual spot check:

## Agent Boundary

- Expected steps:
- Small and focused:
- Split recommendation:

## Stateless Reducer

```text
state + event -> next action
```
