# EVAL_PLAN.md

## Target

-

## Golden Set

| Case | Input | Expected behavior | Category |
|---|---|---|---|
|  |  |  | happy path |
|  |  |  | permission error |
|  |  |  | missing data |
|  |  |  | ambiguous request |
|  |  |  | malicious input |

## Metrics

| Metric | Why it matters | Pass threshold | Manual check required |
|---|---|---|---|
|  |  |  |  |

## Judge Policy

- LLM-as-judge use:
- Deterministic checks:
- Human calibration:
- Governance-impact release gate: deterministic checks only; an LLM judge cannot approve an effectiveness claim.

## Regression Gate

- Run when prompt changes:
- Run when retriever / tool schema / model changes:
- Blocking threshold:

## Traces

- Approved prompt-template version:
- Privacy-safe trace metadata:
- Context source: source ID, source class, trace mode, and an allowed public or opaque pointer; never copied private content.
- Tool call: normalized tool/action ID and stable outcome code only.
- Structured output: validator-approved closed-schema fields only.
- Verifier result: stable check IDs and normalized results only.
- Never retain private prompt text, masked private excerpts, raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, or raw diff hunks.

## Evidence / Claim Boundary

- Runtime proof may claim only that a generated entrypoint satisfies its minimal first-response contract.
- Governance-impact evaluation measures delivery artifacts after intake; it does not test Q1-Q9 interview quality.
- Real mode is synthetic-only: governance-impact runs require clean, committed synthetic scenarios, and runtime proof uses generated synthetic fixtures only.
- Persist only privacy-scanned, normalized closed-schema evidence after cleanup is proven.
- Scanner unavailability, output-schema failure, session-persistence uncertainty, or cleanup uncertainty must fail closed with a stable code and no artifact.
- Codex governance-impact real execution is refused until detached or re-parented descendant containment is proven. Claude and Antigravity real adapters also remain fail-closed; this does not imply that runtime-proof mock contracts are unavailable.

## Cost / Latency

-

## Manual Spot-check

-
