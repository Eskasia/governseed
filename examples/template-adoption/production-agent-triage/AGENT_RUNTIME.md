# AGENT_RUNTIME.md

## Agent Goal

- User: the on-call responder holding the pager when an alert fires.
- Job: assemble the affected services and comparable past incidents, then draft a triage response whose every action states its reversibility.
- Non-goals: executing remediation, paging other teams, publishing incident reports, or deciding severity.

## Trigger Entry

- UI: the draft appears in the existing on-call console when an alert opens.
- cron: none; the agent is event-driven only.
- webhook: alert stream delivery.
- Slack / Gmail / connector: not included.
- CLI / manual: golden-set replay for regression runs.

## State

- Business state: alert, affected services, cited incidents, draft, approval record.
- Execution state: which context lookups have returned, which actions await approval.
- Storage location: incident event log, with the history index as a read-only source.
- Rebuildable from events: yes; every draft is reproducible by replaying the alert and the lookups it recorded.

## Event

- Event type: alert opened, context assembled, draft produced, approval granted or declined.
- Event source: alert stream and the approval service.
- Advancement rule: a draft is produced only after context assembly returns; an action executes only after an approval record exists.

## Context Window

- Format: system policy, alert fields, affected-service summary, cited incident summaries.
- Source: alert stream and the history index, both scoped to this incident.
- Compaction: incident identifiers and short normalized summaries, never full past incident records.
- Forbidden content: raw alert payloads, credentials, customer identifiers, and unrelated incidents.

## Prompts

- Storage location: project prompt files, committed with code.
- Version management: the prompt-template version is pinned and recorded with each draft.
- Modification rule: any prompt or model version change requires an EVAL_PLAN regression run before merge.

## Structured Outputs

- Action schema: action type, target service, reversibility, rationale, cited incident identifiers.
- done / pause / ask_human: ask_human is mandatory for any action whose type writes to production.
- Invalid output handling: a draft failing schema validation is discarded and the failure is recorded; no partial draft reaches the responder.

## Evidence Persistence

- Retained: normalized closed-schema evidence that passed both the validator and the privacy scanner.
- Never retained: raw alert payloads, raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks.
- Real mode: golden-set replay accepts only committed synthetic incidents, and the smoke run uses generated synthetic fixtures only.
- Fail closed: when the scanner, output schema, session persistence, or cleanup cannot be proven safe, return a stable code and write no artifact.
- Cleanup before persist: terminate and reap children, remove the isolated HOME, TMP, and workspace, confirm nothing remains, then write evidence atomically.
- Claim boundary: the smoke run establishes only that the triage entrypoint responds; whether routing improved requires the golden-set evaluation in `EVAL_PLAN.md`.

## Tools

| Tool | Permission | Side effect | Idempotency | Rollback |
|---|---|---|---|---|
| alert reader | read the open alert | none | yes | n/a |
| topology lookup | read service topology | none | yes | n/a |
| history search | read the incident history index | none | yes | n/a |
| runbook fetch | read a published runbook | none | yes | n/a |
| service restart | restart one service instance | destructive | no | re-deploy the previous revision |

## Control Flow

- Program controls alert intake, context assembly order, schema validation, the approval gate, and the audit write.
- Model controls only the wording and ordering of suggestions inside the validated action schema.
- Max steps: context assembly, draft, approval wait — three, with no model-initiated loop.

## Human Approval

- Required action: any action whose type writes to production, including service restart.
- Approver: incident commander.
- Timeout: none that grants permission; an unanswered approval is recorded as declined.
- Fallback: the draft remains visible and the action stays unexecuted.

## Launch / Pause / Resume

- launch: an alert opens.
- pause: an action reaches the approval gate, or a context lookup fails.
- resume: the approval is answered, or the responder retries the lookup.
- retry: allowed for read-only lookups only.
- cancel: the alert closes or the responder dismisses the draft.

## Error Compaction

- Error source: lookup timeout, schema validation failure, approval service unreachable, stale history index.
- Compaction format: stable code, incident identifier, affected step, and next action.
- Retry limit: three retries for read-only lookups; zero for anything past the approval gate.

## Verifier

- tests: approval-gate negative test with a planted production-writing suggestion.
- eval: golden set in `EVAL_PLAN.md`.
- replay: stored drafts replayed against seeded synthetic incidents.
- E2E: alert to draft to approval to audit record.
- manual spot-check: the incident commander reviews one drill draft per shift rotation.

## Agent Boundary

- Expected steps: three.
- Small and focused: yes; the agent assembles context and drafts, and does nothing else.
- The agent cannot page other teams, change severity, publish reports, or execute any action without a recorded approval.

## Stateless Reducer

```text
alert + lookup results -> assemble, draft, or ask_human
```
