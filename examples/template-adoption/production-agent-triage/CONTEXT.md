# CONTEXT.md

## Shared language

| Term | Meaning | Do not confuse with |
|---|---|---|
| Draft | A proposed triage response the agent produced | An executed action |
| Approval | A recorded human decision to permit one action | A responder reading the draft |
| Reversibility | Whether an action can be undone without data loss | Whether the action is risky |
| History index | The searchable record of past incidents | The live alert stream |

## Roles

| Role | Goal | Permission / boundary |
|---|---|---|
| On-call responder | Triage the alert quickly and correctly | Reads drafts; cannot widen the action boundary |
| Incident commander | Approve production-changing actions | Owns approvals; does not edit prompts |
| Security reviewer | Keep the action boundary and retention rules intact | Owns `AI_SECURITY_REVIEW.md` |

## Data objects

| Object | Meaning | Source of truth |
|---|---|---|
| Alert | One incoming alert event | Alert stream |
| Draft | One structured triage proposal | Agent output, validated against the action schema |
| Approval record | One human decision with actor and time | Approval service audit log |

## Existing constraints

- The agent runs inside the existing on-call service and inherits its identity.
- No new production-writing tool may be added without a security review entry.

## Decisions already made

- The program controls the loop; the model only fills a closed action schema.
- Any production-changing action stops at ask_human, without exception.
