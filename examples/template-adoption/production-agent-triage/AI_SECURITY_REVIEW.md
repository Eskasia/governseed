# AI_SECURITY_REVIEW.md

## Scope

- Alert-driven triage drafting with a mandatory approval gate before any production-changing action.

## Prompt Injection

- External content source: alert payload text and past incident summaries, both of which can carry attacker-influenced strings.
- System / developer policy boundary: no alert or incident text may change the action schema, the approval requirement, or the tool set.
- Test cases: an alert whose description asks for an unapproved restart, and a past incident summary containing an instruction to skip approval.

## Data Leakage

- PII / tenant data: alert payloads may carry customer identifiers; only normalized service-level fields enter the context window.
- Secret handling: no credential or environment variable is placed in the prompt or in evidence.
- Context minimization: incident identifiers and short summaries only, never full past incident records.
- Approved prompt-template version: pinned in the prompt file and recorded with each draft.
- Privacy-safe trace metadata: stable IDs, source class / trace mode, relative paths, aggregate counts or timing, and check IDs only.
- Forbidden retention: private prompt text, masked private excerpts, raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks.

## Tool Side Effects

| Tool | Permission | Side effect | Human approval | Rollback |
|---|---|---|---|---|
| alert reader | read the open alert | none | no | n/a |
| topology lookup | read service topology | none | no | n/a |
| history search | read the incident history index | none | no | n/a |
| runbook fetch | read a published runbook | none | no | n/a |
| service restart | restart one service instance | destructive | yes | re-deploy the previous revision |

## Tenant / Access Isolation

- The agent inherits the on-call service identity and can read only the services in the alerting scope; a lookup outside that scope fails rather than widening.

## Output Handling

- Shell: no shell execution from model output; the model emits action types, never commands.
- SQL: no direct SQL from model output.
- HTML: escape alert and incident text before rendering it in the console.
- Payment / delete / publish: not reachable; the tool set contains no such action.
- Evidence schema: persist only validator-approved, privacy-scanned, normalized closed-schema evidence.
- Real-mode data: synthetic-only; golden-set replay and smoke runs never use customer incidents, tenant data, or production alert payloads.
- Privacy scanner: initialization or execution failure must fail closed without hashing or persisting blocked bytes.
- Cleanup: terminate and reap children, remove isolated temporary state, and prove absence before persistence; uncertainty returns a stable failure code and no artifact.
- Replay capability: a golden-set run is refused unless the seeded workspace is committed and clean, because an uncommitted seed cannot be reproduced from the recorded evidence.

## Key Lifecycle

- Owner: release-owner-role.
- Rotation: quarterly, and immediately after any suspected exposure.
- Revocation: revoke at the provider and redeploy; the agent fails closed with no key.
- Storage: platform secret store, injected as environment variables at run time.

## External Actions

- None. The only production-changing action is an internal service restart, and it is gated by an approval record.

## Kill Switch

- A single feature flag stops draft generation; alerts continue to reach the responder unchanged, so disabling the agent degrades nothing.

## Residual Risk

- A stale history index can produce a plausible citation to an incident that no longer resembles the current one; this is tracked as LOOP-402.
- Claim boundary: a green golden set claims only that the listed incidents were triaged as recorded. It does not claim the agent is correct on incident classes absent from the set.
- Claim boundary: the smoke run claims only that the triage entrypoint answers; it says nothing about routing quality.
- Injection review covered the incident history and the runbook corpus. Attachments are out of scope this release because they are not yet ingested, so nothing here supports a claim about them.
- No evidence is retained from a run whose privacy scan did not complete, so an unexplained drop in stored traces means the scanner failed closed, not that triage volume fell.
