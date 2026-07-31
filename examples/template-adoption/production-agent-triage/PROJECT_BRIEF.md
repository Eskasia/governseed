# PROJECT_BRIEF.md

## One-line summary

An on-call incident triage agent reads alerts and writes the first remediation draft; any action that changes production requires human approval.

## Users

- On-call engineers
- Incident commanders

## Problem

The first fifteen minutes of a night-time alert go almost entirely to collecting context and comparing past incidents, and a tired on-call engineer easily misses a known recurring failure.

## MVP

- On receiving an alert, produce a remediation draft including related historical incidents and affected services.
- Every suggested action in the draft states its reversibility.
- Any action that writes to production stops at ask_human and never runs automatically.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-401 | synthetic | attestation-only | n/a | no | confirmed | operator-role | 2026-07-31 |
| SRC-402 | synthetic | attestation-only | n/a | no | confirmed | security-reviewer-role | 2026-07-31 |
| SRC-403 | synthetic | attestation-only | n/a | no | confirmed | release-owner-role | 2026-07-31 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: production-facing assistive agent with mandatory human approval
- Q1-Q9 basis: the user is an on-call engineer in the middle of an incident who needs the context-collection time shortened, not the decision made for them; a wrong remediation costs far more than being ten minutes slower.
- Why not website / app / mini program / backend-only / admin system or another shape: a dashboard cannot assemble context on its own; a backend-only service offers no conversational surface for follow-up questions; an admin system's pace does not match an active incident.
- Decision status: active
- Evidence: SRC-401, SRC-402, SRC-403, REQ-401@1, REQ-402@1
- Nearest alternative: a fully autonomous remediation agent
- Review trigger: event-only when a full quarter of drafts has been reviewed and the false-suggestion rate is measured

## Explicitly out of scope

- No automatic remediation execution.
- No cross-organization alert aggregation.
- No external publication of incident reports.

## Acceptance owner

- An on-call engineer completes triage using the draft during one drill incident.

## Done criteria

- Every production-changing suggestion in the draft stops at ask_human, and the golden set contains no unapproved execution.
