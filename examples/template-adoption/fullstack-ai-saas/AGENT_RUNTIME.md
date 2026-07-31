# AGENT_RUNTIME.md

## Agent Goal

- User: workspace member asking questions about uploaded documents.
- Job: answer only from retrieved workspace evidence and return citations.
- Non-goals: autonomous file deletion, billing, external outreach, or cross-workspace search.

## Trigger Entry

- UI: question form in the RAG preview.
- cron: none for MVP.
- webhook: none for MVP.
- Slack / Gmail / connector: not included.
- CLI / manual: local golden-set replay.

## State

- Business state: workspace, document, chunk, question, answer.
- Execution state: retrieval query, selected chunks, answer status.
- Storage location: database plus vector store metadata.
- Rebuildable from events: document ingestion can be replayed from uploaded source metadata.

## Event

- Event type: document uploaded, question submitted, answer generated.
- Event source: preview UI.
- Advancement rule: question submission starts retrieval, answer generation starts only after workspace-filtered chunks are selected.

## Context Window

- Format: system policy, user question, retrieved chunks, citation metadata.
- Source: chunks filtered by workspace id.
- Compaction: include only chunk ids, source anchors, and short text excerpts.
- Forbidden content: unrelated tenant data, raw secrets, and full document dumps.

## Prompts

- Storage location: project prompt files.
- Version management: commit with code changes.
- Modification rule: prompt changes require EVAL_PLAN regression.

## Structured Outputs

- Action schema: answer text, citations, confidence, fallback reason.
- done / pause / ask_human: ask_human only when uploaded source is insufficient or ambiguous.
- Invalid output handling: reject citationless factual answers.

## Evidence Persistence

- Retained: normalized closed-schema evidence that passed both the validator and the privacy scanner.
- Never retained: raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks.
- Real mode: replay accepts only committed synthetic workspaces, and the smoke run uses generated synthetic fixtures only.
- Fail closed: when the scanner, output schema, session persistence, or cleanup cannot be proven safe, return a stable code and write no artifact.
- Cleanup before persist: terminate and reap children, remove the isolated HOME, TMP, and workspace, confirm nothing remains, then write evidence atomically.
- Claim boundary: the smoke run establishes only that the answer endpoint responds; whether answers improved requires the golden-set evaluation in `EVAL_PLAN.md`.

## Tools

| Tool | Permission | Side effect | Idempotency | Rollback |
|---|---|---|---|---|
| retrieval | read workspace chunks | none | yes | n/a |
| answer generation | call model provider | cost | no | retry with same trace id |
| document delete | delete workspace document | destructive | no | restore from backup if available |

## Control Flow

- Program controls authentication, workspace filter, retrieval call, citation validation, and logging.
- Model controls answer wording inside structured output.
- Max steps: retrieval, answer, validation.

## Human Approval

- Required action: document delete and public demo sharing.
- Approver: workspace owner.
- Timeout: no automatic destructive fallback.
- Fallback: pause and show pending approval.

## Launch / Pause / Resume

- launch: user submits a question.
- pause: missing evidence, ambiguous question, or approval needed.
- resume: user clarifies or owner approves.
- retry: allowed for transient provider errors.
- cancel: user closes or clears the question.

## Error Compaction

- Error source: retrieval miss, provider failure, invalid citation, permission mismatch.
- Compaction format: code, trace id, workspace id hash, and next action.
- Retry limit: three transient retries.

## Verifier

- tests: tenant isolation unit test.
- eval: golden set in EVAL_PLAN.
- replay: stored traces with synthetic workspace data.
- E2E: upload, ask, citation, fallback.
- manual spot-check: owner reviews preview questions.

## Agent Boundary

- The agent cannot browse outside the workspace, execute shell commands, change billing, or publish documents.

## Stateless Reducer

```text
workspace + question -> retrieve, answer, or ask_human
```
