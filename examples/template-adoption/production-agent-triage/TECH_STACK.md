# TECH_STACK.md

## Technology route decision

- Decision mode: user-declared route
- Primary route: program-controlled agent loop with a model confined to structured output
- Rationale: the incident-response risk is the model deciding actions on its own, so flow order, tool calls, and approval gates are program-controlled and the model only produces suggestions inside a closed schema.
- Excluded routes: no autonomous agent framework, no direct model shell access, no multi-agent negotiation, because each moves the action decision out of the code.
- Late-stage risks: a change in alert source format degrades context collection; a stale historical incident index produces plausible but wrong matches.
- Re-evaluation triggers: re-evaluate loosening some reversible actions once the measured wrong-suggestion rate of drafts is below the agreed threshold and the incident commander agrees.
- New technology gate: before introducing any tool that can write to production, record its permission, side effects, approval, and rollback in AI_SECURITY_REVIEW.
- Decision status: active
- Evidence: SRC-401, SRC-402, SRC-403, REQ-401@1, REQ-402@1
- Nearest alternative: autonomous agent framework with post-hoc audit
- Review trigger: event-only when the measured false-suggestion rate supports widening the action boundary

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Existing on-call console | unchanged | Draft appears where the responder already is | New standalone UI |
| Backend | Stateless reducer service | project pinned | Every step is replayable from the event log | Long-lived agent process |
| Database | Incident event log plus history index | project pinned | Business state and execution state stay separable | In-memory session state |
| Main framework / SDK | Model provider SDK with structured output | project pinned | Schema-constrained output is the containment boundary | Free-form completion |
| Package manager | Project standard | project pinned | No new toolchain introduced | Alternative registry |
| Deployment | Existing internal release pipeline | unchanged | Ships with the on-call service | Separate service |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| Model provider | Draft generation | `MODEL_API_KEY` | release-owner-role |
| Alert source | Incoming alert stream | `ALERT_STREAM_TOKEN` | operator-role |

## Version Policy

- Pin the model version in the prompt-template record; a version change requires an EVAL_PLAN regression run.

## Constraints

- No tool that writes to production may be reachable without an ask_human step.
