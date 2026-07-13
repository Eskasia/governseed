# Governance Evidence Overhaul Design

**Date:** 2026-07-13  
**Status:** Approved —方案 A confirmed by the user  
**Scope:** agent-governance-starter source repository and generated-project governance artifacts

## Goal

Turn the starter from a structurally consistent document generator into an evidence-oriented governance bootstrapper. The overhaul must preserve the public boundary that this project is not an application template, runtime framework, or multi-agent orchestrator.

The design adds four capabilities:

1. Privacy-safe intent provenance and append-only requirement revisions.
2. Canonical rule ownership with conflict, suspension, and stale-decision handling.
3. Machine-checkable doctor findings that verify cross-document behavior rather than marker strings alone.
4. A local paired baseline/governed impact evaluation harness with deterministic controls and explicit real-runtime opt-in.

## Evidence Behind the Design

- Current runtime proof validates first-response contracts and explicitly is not a live model benchmark.
- Current doctor route checks accept non-empty placeholders and do not compare route mode across PROJECT_BRIEF.md and TECH_STACK.md.
- Current fixture checks compare golden doctor JSON but contain no negative mutation cases.
- The new product-shape workflow is required by the validator but is currently untracked, so a green local run does not prove a complete commit.
- SECURITY.md prohibits private prompts, private source data, credentials, and private logs from entering the repository.
- The referenced article correctly identifies intent drift and rule drift, but its "store every original word" rule conflicts with this repository's privacy boundary.

## Global Constraints

- Add no new required generated-project document.
- Keep AGENTS.md canonical; Claude and Antigravity remain thin adapters.
- Do not add fixed AI roles, persistent agent processes, daemons, hosted services, databases, or provider SDKs.
- Use Node.js >=20 standard-library APIs only; add no runtime dependency.
- Preserve existing user changes unless the approved design directly replaces overlapping route-gate work.
- Never save private prompt text, masked private excerpts, raw model stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, or raw diff hunks.
- Offline CI may prove harness mechanics only. Public effectiveness claims require real paired runs that satisfy the evidence gate.

## Approaches Considered

### A. Embedded evidence ledgers and paired evaluator — selected

Embed provenance in existing documents, keep rule lifecycle in canonical AGENTS.md, extend doctor with behavior checks, and add a separate impact evaluator. This has no new fixed document and directly closes the evidence gap.

### B. REQUIREMENTS.md plus generated rules/index.json

This produces a cleaner standalone registry but adds a second canonical surface, profile/init migration, and permanent ceremony to every generated project. It is deferred until embedded ledgers fail in at least two independent projects or adapter families exceed three.

### C. Doctor-only hardening

This is smaller, but it cannot establish whether governance improves delivery. It fails the approved objective and is rejected.

## Architecture

### 1. Privacy-safe intent lineage

The lineage is:

    SRC attestation -> REQ revision -> AC -> TASK -> EVD

PROJECT_BRIEF.md owns the append-only source attestation registry. It does not store private source content.

| Field | Allowed value |
|---|---|
| Source ID | SRC-001 style opaque local identifier |
| Source class | public, approved-private-external, private-interactive, synthetic |
| Trace mode | public-pointer, opaque-pointer, attestation-only |
| Source ref | Public canonical URL or opaque external-system alias; n/a for interactive private prompts |
| Content retained | Always no for private sources |
| Attestation | confirmed, rejected, pending |
| Confirmed by / at | Role label and ISO date; no personal identifier |

SPEC.md owns the append-only requirement revision ledger.

| Field | Contract |
|---|---|
| Revision | REQ-001@1 style stable ID and monotonic revision |
| Operation | add, replace, withdraw |
| Class | must, redline |
| Normalized requirement | Non-sensitive observable behavior |
| Source | Existing SRC ID |
| Confirmed by | Confirmed SRC attestation |
| Supersedes | Existing earlier revision for replace/withdraw |

Active requirements are derived by replay: an add or replace remains active until a later valid replace or withdraw supersedes it. Rows are not deleted. A split withdraws the original and adds new requirement IDs.

SPEC.md acceptance criteria use AC IDs and reference one active requirement revision. TASK_CONTRACT.md tasks reference REQ and AC IDs. Its acceptance evidence table records EVD IDs, a safe command/CI/public-artifact locator, result, and date. OPEN_LOOPS.md receives every not-stated item and records the SRC attestation that resolves it.

Product-shape and technology-route decisions reference SRC and active REQ revisions. An AI-recommended route cites them only as constraints; it must never present the route itself as a user statement.

### 2. Rule lifecycle without a synthetic "Nüwa" role

The repository root AGENTS.md owns starter maintenance rules. Generated projects use the generated root AGENTS.md as their canonical owner. Workflows explain procedures; START_HERE, prompts, CLAUDE.md, and Antigravity adapters reference gate IDs instead of restating the rule.

The generated AGENTS.md has a compact Governance Gates table:

| ID | Owner | Status | Evidence | Review | Fallback |
|---|---|---|---|---|---|
| GATE-INTENT-001 | PROJECT_BRIEF.md + SPEC.md | active | SRC/REQ/AC chain | event-only | open blocking loop; do not implement |
| GATE-ROUTE-001 | PROJECT_BRIEF.md + TECH_STACK.md | active | matching route evidence | event-only | mark recheck-required; do not implement |

Allowed rule status is active or suspended. A broken rule is suspended first so consumers stop using it. Permanent retirement removes it from the canonical table and leaves a retired/superseded-by tombstone in CHANGELOG.md. New hard gates require either two independent repeated failures or one irreversible/high-severity risk.

Decision documents use decision status active or recheck-required. Re-evaluation is event-triggered rather than a recurring meeting. Triggers include changed core user/success behavior, immutable-system constraints, deployment/acceptance changes, scale beyond the selected route, or validation failure.

### 3. Doctor behavior checks

Doctor retains schemaVersion 1 and existing top-level fields to avoid a gratuitous breaking change. Stable finding codes prefix warning strings; messages include only relative governance filenames, IDs, and counts.

Required finding codes include:

- ROUTE_MODE_CONFLICT
- ROUTE_PLACEHOLDER
- STALE_DECISION
- TRACE_SOURCE_MISSING
- TRACE_CONFIRMATION_MISSING
- TRACE_REVISION_INVALID
- TRACE_ACCEPTANCE_MISSING
- TRACE_TASK_COVERAGE_MISSING
- TRACE_EVIDENCE_MISSING
- PRIVACY_SOURCE_BLOCKED
- PRIVACY_PATH_BLOCKED

Doctor may mechanically verify identifier syntax, references, revision graph integrity, active-requirement coverage, route-mode equality, placeholders, recheck-required state, missing evidence, symlinks, root escape, invalid UTF-8, and files over 1 MiB.

Doctor must not claim to verify product suitability, semantic equivalence between private source and normalized requirement, truth of human approval, value of a new dependency, or real-world occurrence of a re-review trigger. These remain explicit human-review boundaries.

Project-file reads use an allowlist, lstat/realpath containment, no symlink following, fatal UTF-8 decoding, and a 1 MiB limit. Findings never echo matched values or absolute paths.

### 4. Governance impact evaluation

Runtime proof remains a separate entrypoint-contract smoke test. The new evaluator measures delivery artifacts after intake is already complete; it does not claim to test Q1-Q9 interview quality.

Each scenario contains:

    scenario.json
    seed/
    task.md
    governed-overlay/
    oracle/

The runner creates paired fresh workspaces:

- baseline = seed plus the canonical task;
- governed = the same seed and task plus generated, filled governance documents.

Canonical facts must be identical between arms. The governed overlay may reorganize facts but may not add requirements. Oracle code and output bundles remain outside agent-writable workspaces. Execution order is randomized by a recorded seed.

The CLI supports:

- validate: schema, fact parity, paths, hashes, and controls;
- replay: re-score an existing safe run bundle without executing an agent;
- run: real Codex, Claude, or Antigravity CLI in explicit opt-in mode;
- aggregate: pair and summarize comparable results;
- gate: evaluate a release evidence policy.

Default npm run eval:governance executes schemas, scorer tests, and synthetic baseline-win/governed-win/tie controls only. Real execution requires GOVERNANCE_IMPACT_REAL=1. A missing executable never falls back to mock output.

The scorer is arm-label neutral and uses deterministic checks:

- acceptance rate;
- explicit requirement omission rate;
- explicit prohibition violation rate;
- changed-path scope violation rate;
- repair rounds and first-pass success;
- wall time and token usage only when both arms expose trustworthy telemetry;
- governed document drift.

deliveryPass requires completed execution, all acceptance checks passing, no critical check failure, no requirement omission, no forbidden-path change, and no critical document drift. Winner selection is lexicographic: pass, then score delta of at least one point, then fewer repair rounds, else tie. Time/token never make a failed run win.

CI contains baseline-win, governed-win, tie, missing-telemetry, timeout, tamper, and corrupt-schema controls so the scorer cannot prove governance wins by construction.

### 5. Privacy boundary for evaluator and runtime proof

Only committed synthetic/public scenarios may enter live evaluation. Child processes receive a minimal environment and argv arrays with shell:false. The harness never serializes environment variables.

Raw stdout/stderr and diff hunks are not persisted. Bounded in-memory parsing produces stable error codes, relative changed paths, line counts, hashes of synthetic/public artifacts, aggregate timing, optional aggregate token counts, and check IDs. Temporary synthetic workspaces are removed in finally blocks; cleanup failure is a non-zero infrastructure failure.

Real mode refuses unknown data classification, absolute/artifact path escape, symlinked inputs, secret/PII scanner failure, session-persistence uncertainty, output schema violations, or cleanup failure. It never silently degrades to a less safe mode.

## Data Flow

### Generated project

1. Agent records a privacy-safe source attestation in PROJECT_BRIEF.md.
2. Agent creates normalized must/redline revisions in SPEC.md; unspoken assumptions go to OPEN_LOOPS.md.
3. User confirmation is recorded by SRC ID and exact REQ revisions.
4. Product and route decisions cite active evidence.
5. TASK_CONTRACT.md maps each task to REQ and AC IDs.
6. Verification creates EVD records; failure remains visible and blocks completion.
7. Requirement changes append source/revision rows; old rows remain and active state is replayed.

### Impact evaluator

1. Validate scenario and preregistered hashes.
2. Prepare equivalent baseline/governed workspaces.
3. Run each arm in randomized order with the same runtime/model/config label.
4. Verify with hidden deterministic oracle.
5. Emit privacy-safe run evidence.
6. Score each arm without reading its label.
7. Pair, aggregate, and apply claim/release policy.

## Failure Handling

- Missing/invalid SRC, REQ, AC, TASK, or EVD reference: warning; strict doctor exits 1.
- Replace/withdraw missing an earlier revision, pointing forward, or forming a cycle: strict failure.
- Conflicting unclassified sources: create blocking OPEN_LOOPS entry; do not choose silently.
- Route mode mismatch, placeholder, or recheck-required: strict failure.
- Agent timeout: record safe timeout evidence, terminate process group, verify partial artifacts, deliveryPass=false.
- Missing runtime: exit 4 in real mode; no mock artifact.
- Oracle/fixture hash change: infrastructure failure; do not score.
- Token/time unavailable: null with availability=unavailable; exclude from comparison.
- Privacy or cleanup failure: stable privacy/infrastructure code and non-zero exit; never print the sensitive value.

## Testing Strategy

All new JavaScript behavior uses node:test and follows red-green-refactor. Tests exercise exported pure parsing/scoring functions and subprocess boundaries with fake executables.

### Doctor negative cases

- route modes conflict;
- TODO/TBD/待定 or angle-bracket placeholder;
- recheck-required decision;
- missing source or confirmation;
- invalid replacement graph;
- acceptance or task references superseded revision;
- active requirement lacks task/evidence coverage;
- governance file is a symlink or exceeds limits;
- source ref contains absolute path, query secret, private URL, or ordinary private-content hash.

### Evaluator controls

- baseline wins;
- governed wins;
- tie;
- missing telemetry remains null and cannot influence winner;
- forbidden path fails even when acceptance passes;
- timeout and non-zero child exit retain safe verifier evidence;
- missing CLI does not mock;
- run/scenario tampering is rejected;
- stdout/stderr canary secrets never reach disk or parent output;
- execution order does not alter pairing;
- differing runtime/model/config/scenario hash cannot pair.

## File Responsibilities

### Existing governance surface

- templates/fixed/PROJECT_BRIEF.md: SRC attestation registry and route evidence.
- templates/fixed/SPEC.md: append-only REQ revisions and AC mapping.
- templates/fixed/TASK_CONTRACT.md: task coverage and EVD table.
- templates/fixed/OPEN_LOOPS.md: not-stated and resolution-source tracking.
- templates/fixed/TECH_STACK.md: route snapshot, decision state, evidence, review trigger.
- templates/runtime/AGENTS.md: canonical gate ledger and fallback.
- startup and prompts: cite gate IDs and lifecycle flow.
- workflows/product-shape-tech-route.md: decision method only.
- workflows/agent-file-structure.md: route durable rules only; no mandatory seven-field ritual per phase.
- CHANGELOG.md and PR template: canonical rule change announcement/tombstones.

### Doctor and tests

- scripts/lib/governance-checks.mjs: safe reads, trace parser, route and lifecycle checks.
- scripts/doctor.mjs: profile/document orchestration and rendering.
- tests/governance/doctor-governance.test.mjs: positive and mutation cases.
- scripts/fixtures-check.mjs: golden fixture output plus negative mutations.

### Impact evaluator

- scripts/governance-impact-eval.mjs: CLI parsing and command orchestration.
- scripts/lib/governance-impact-core.mjs: validation, hashing, scoring, pairing, aggregation, gate.
- scripts/lib/governance-impact-adapters.mjs: real runtime argv contracts and process control.
- schemas/governance-impact-*.schema.json: scenario, run, and result contracts.
- tests/governance-impact/: node:test coverage, controls, and synthetic scenarios.
- docs/governance-impact-eval.md: evidence levels, usage, privacy, and claim boundaries.

## Migration and Compatibility

- No generated file is added, so profile manifests remain structurally compatible.
- Fresh unfilled templates continue to produce warnings rather than init failure.
- Filled fixtures migrate to the new lineage and route fields and remain strict-ready.
- Existing generated projects receive explicit migration warnings for missing lineage; normal doctor remains advisory while strict doctor blocks implementation/release claims.
- doctor output retains schemaVersion 1 and existing fields; new warning codes are additive strings.
- Runtime proof remains separately named and keeps its narrow public claim.

## Public Claim Gate

Offline controls prove only that the harness is reproducible and label-neutral. A README claim that governance improves delivery requires, per claimed runtime:

- at least five preregistered scenarios with three complete paired repetitions each;
- at least 90% pair completeness;
- identical scenario/runtime/model/config labels within pairs;
- no new critical scope, prohibition, privacy, or document regression;
- non-negative deliveryPass paired delta;
- paired-bootstrap 95% confidence interval lower bound above zero for an "improves" claim;
- at least 80% telemetry coverage before any time/token claim.

Absent that evidence, documentation may report observed deltas only and must not generalize to real-world adoption.

## Non-goals

- No multi-agent scheduler or role runtime.
- No automatic semantic approval of product/technology choices.
- No LLM-as-judge in the release gate.
- No private conversation archive.
- No promise that the starter universally improves every project or model.
- No hosted telemetry or remote data collection.

## Completion Criteria

The overhaul is complete only when:

1. Generated docs implement the SRC/REQ/AC/TASK/EVD chain and append-only change flow.
2. Doctor detects route conflicts, placeholders, stale decisions, broken lineage, missing coverage, and unsafe paths using stable codes.
3. Rule IDs have one canonical owner; adapters remain thin and runtime smoke tests prove the references.
4. The impact evaluator validates, replays, runs explicit real adapters, aggregates, and gates results without mock fallback.
5. Baseline-win, governed-win, tie, telemetry, timeout, tamper, and privacy controls pass on all CI operating systems.
6. Examples, prompts, schemas, docs, indexes, changelog, and expected doctor output agree.
7. npm run ci, npm run runtime:proof, strict fixture doctors, targeted privacy/governance tests, and git diff --check all pass from the final worktree.
8. An independent reviewer and QA agent report no unresolved high-severity finding.
