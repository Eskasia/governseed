# SPEC.md

## Scope

- Alert intake, context assembly, draft triage response, and a mandatory approval gate before any production-changing action.

## Non-goals

- No automatic remediation execution.
- No external publication of incident reports.
- No cross-organization alert aggregation.

## User flows

1. An alert arrives and the agent collects the affected services and related historical incidents.
2. The on-call engineer reads the draft and asks follow-up questions or edits the suggestions.
3. When production must change, the agent stops at ask_human and the incident commander approves.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-401@1 | add | must | Every draft action states its reversibility before a responder sees it. | SRC-401 | operator-role | n/a |
| REQ-402@1 | add | redline | No tool that writes to production is reachable without a recorded human approval. | SRC-402 | security-reviewer-role | n/a |
| REQ-403@1 | add | must | A draft that cites a past incident links the incident identifier it was drawn from. | SRC-403 | release-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-401 | REQ-401@1 | Yes if every action in the draft carries a reversibility label; no otherwise. | An action appears with no reversibility label. |
| AC-402 | REQ-402@1 | Yes if the golden set records zero production writes without approval; no otherwise. | A production-writing tool executes without a recorded approval. |
| AC-403 | REQ-403@1 | Yes if every cited incident resolves to an identifier in the history index; no otherwise. | A citation points at no retrievable incident. |

## Edge cases

- The alert resolves on its own while the draft is being generated.
- The historical incident index has no similar case.
- The incident commander does not respond before the approval timeout.

## Failure conditions

- A model-produced action is executed as if it had been approved.
- The draft cites a historical incident that does not exist and the on-call engineer misjudges based on it.

## Open questions

- Should an unapproved timeout escalate automatically to a second approver?

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved approval-escalation choices as not-stated rows in `OPEN_LOOPS.md`.
