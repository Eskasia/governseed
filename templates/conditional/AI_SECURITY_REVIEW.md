# AI_SECURITY_REVIEW.md

## Scope

-

## Prompt Injection

- External content source:
- System / developer policy boundary:
- Test cases:

## Data Leakage

- PII / tenant data:
- Secret handling:
- Context minimization:
- Approved prompt-template version:
- Privacy-safe trace metadata: stable IDs, source class / trace mode, relative paths, aggregate counts or timing, and check IDs only.
- Forbidden retention: private prompt text, masked private excerpts, raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks.

## Tool Side Effects

| Tool | Permission | Side effect | Human approval | Rollback |
|---|---|---|---|---|
|  |  |  |  |  |

## Tenant / Access Isolation

-

## Output Handling

- Shell:
- SQL:
- HTML:
- Payment / delete / publish:
- Evidence schema: persist only validator-approved, privacy-scanned, normalized closed-schema evidence.
- Real-mode data: synthetic-only; never use private, tenant, customer, or production content for governance-impact or runtime-proof execution.
- Privacy scanner: initialization or execution failure must fail closed without hashing or persisting blocked bytes.
- Cleanup: terminate and reap children, remove isolated temporary state, and prove absence before persistence; uncertainty returns a stable failure code and no artifact.
- Evaluator capability: Codex real execution remains refused until detached or re-parented descendant containment is proven; Claude and Antigravity remain fail-closed until their containment and non-persistence contracts are proven.

## Key Lifecycle

- Owner:
- Rotation:
- Revocation:
- Storage:

## External Actions

-

## Kill Switch

-

## Residual Risk

- Runtime-proof claim boundary: entrypoint first-response contract only; not model quality or governance effectiveness.
- Governance-impact claim boundary: delivery artifacts after completed intake, subject to the separate evidence gate.
- Current evaluator capability: Claude is refused while workspace containment is unproven; Antigravity is unavailable when missing and otherwise refused until non-persistence and containment are proven.
