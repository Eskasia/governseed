# Governance Impact Evaluation

The governance-impact evaluator is a local paired A/B harness for measuring delivery artifacts after project intake is already complete. It compares:

- `baseline`: the synthetic seed plus the canonical task;
- `governed`: the same seed and task plus the governed overlay.

Runtime proof is a separate entrypoint-contract smoke test. Neither runtime proof nor offline evaluator controls prove that governance improves real delivery.

## Evidence Levels

| Surface | What it can establish | What it cannot establish |
|---|---|---|
| Offline controls | Scoring, aggregation, and gate mechanics are deterministic and arm-label neutral. | Real runtime behavior or governance effectiveness. |
| `validate` | Scenario shape, fact parity, privacy/path policy, tracked-clean state, artifact hashes, and optional manifest/policy pins. | Agent behavior or delivery quality. |
| `replay` | A preregistered safe run can be re-scored without launching an agent. | A new live observation. |
| Real paired `run` | One baseline/governed observation for a preregistered synthetic attempt. | A generalized claim by itself. |
| `aggregate` + `gate` | Comparable paired evidence satisfies the selected observed/improves policy. | Universal adoption, product suitability, or interview quality. |

No live evaluator run or effectiveness result is bundled with this repository. For this evaluator, public CI runs offline controls and deterministic tests only.

## Offline Quick Start

These commands must run without credentials, network access, or a real agent CLI:

```bash
npm run test:governance-impact
npm run validate:governance-impact
npm run eval:governance
```

The direct no-argument evaluator command runs exactly five committed controls and persists no artifact:

```bash
node scripts/governance-impact-eval.mjs
```

| Control | Expected winner |
|---|---|
| `baseline-wins` | baseline |
| `governed-wins` | governed |
| `tie` | tie |
| `missing-telemetry` | tie |
| `forbidden-change` | baseline |

Offline controls never resolve a runtime executable, create a live workspace, read credentials, or set `GOVERNANCE_IMPACT_REAL`.

## Frozen CLI Contract

All options are long-form. Every caller-supplied path is a repository-relative POSIX path. Unknown, duplicated, missing, absolute, backslash, traversal, or empty path options are rejected.

```text
node scripts/governance-impact-eval.mjs

node scripts/governance-impact-eval.mjs validate
  --scenario <scenario-directory>
  [--manifest <manifest.json>]
  [--policy <policy.json>]

node scripts/governance-impact-eval.mjs replay
  --scenario <scenario-directory>
  --manifest <manifest.json>
  --run <paired-run.json>
  --output <scored-result.json>

GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs run
  --scenario <scenario-directory>
  --manifest <manifest.json>
  --policy <policy.json>
  --attempt-id <64-lowercase-hex>
  --output <paired-run.json>
  [--timeout-ms <positive-safe-integer>]

node scripts/governance-impact-eval.mjs aggregate
  --manifest <manifest.json>
  --policy <policy.json>
  --run <paired-run.json> [--run <paired-run.json> ...]
  --output <aggregate-report.json>

node scripts/governance-impact-eval.mjs gate
  --report <aggregate-report.json>
  --policy <policy.json>
  --run <paired-run.json> [--run <paired-run.json> ...]
```

`run` has no runtime, model, config, seed, or repetition override. Those values come from the preregistered manifest.

### Command Semantics

| Command | Behavior | Persistent output |
|---|---|---|
| no argument | Validates and scores the five offline controls. | None |
| `validate` | Requires a tracked, staged/unstaged-clean scenario, verifies all four artifact hashes, and optionally normalizes a manifest and checks policy pins. A policy requires a manifest. | None |
| `replay` | Reopens and rehashes the scenario, verifies run/manifest identity, and scores an existing paired run without launching an agent. Run `validate` first in the public workflow. | Closed scored result |
| `run` | Requires exact real opt-in, a clean committed synthetic scenario, a pinned manifest/policy, an available safe adapter, and a new output path. | Closed paired-run evidence after cleanup |
| `aggregate` | Re-scores submitted runs, rejects non-comparable or duplicate attempts, applies the policy bootstrap seed, and commits accepted-run hashes into one report. | Closed aggregate report |
| `gate` | Re-validates the report and policy; an improves claim also recomputes the report from the supplied paired runs. | None |

The term “paired run” refers to the closed `governance-impact-run` schema. It never means raw model stdout/stderr, a transcript, a tool trace, or a diff hunk.

Output paths must not already exist. `replay`, `run`, and `aggregate` reject repository escapes or symlinked output parents before publication and never overwrite evidence.

## Scenario Preregistration

Each scenario has this layout:

```text
scenario.json
seed/
task.md
governed-overlay/
oracle/
```

`scenario.json` closes the contract over:

- `dataClassification`: `synthetic` or `public`; real `run` accepts only `synthetic`;
- four artifact hashes: `seed`, `task`, `governedOverlay`, and `oracle`;
- canonical `FACT-*` requirements, prohibitions, and optional context;
- identical baseline/governed `factParity` sets;
- deterministic `CHECK-*` acceptance, prohibition, document, and privacy checks;
- allowed and forbidden repository-relative changed paths;
- an oracle argv array and the complete declared check-ID set.

Every requirement and prohibition must be covered by the corresponding deterministic check. The governed overlay may organize the same canonical facts but must not add a requirement unavailable to baseline. Oracle code and the runner-owned closed runtime-response schema remain outside agent-writable workspaces.

Before `validate` or real `run`, every scenario artifact must:

1. be present in `git ls-files`;
2. have no staged or unstaged diff;
3. be outside a submodule;
4. be a regular, non-symlinked, non-hard-linked input inside the repository;
5. pass bounded UTF-8 and privacy scans before hashing;
6. match every preregistered artifact hash.

An untracked or dirty scenario is `SCENARIO_NOT_COMMITTED` with exit 2. Hash drift is `ARTIFACT_HASH_MISMATCH`; unsafe paths and links are refused before execution.

### Attempt Manifest

The manifest is a closed object containing:

- `schemaVersion: 1`;
- one cohort: `runtime`, `model`, `config`, and `starterCommit`;
- one or more attempts: `attemptId`, `scenarioHash`, `repetitionId`, and `seed`.

`attemptId` is derived from the scenario hash, repetition ID, seed, and all cohort fields. Duplicate attempt IDs or duplicate scenario/repetition pairs are invalid. Normalization sorts attempts deterministically and produces the `manifestHash` used by the policy.

The manifest cohort is immutable for a report. Results with a different runtime, model, config, starter commit, scenario hash, repetition ID, or seed are rejected rather than pooled.

### Gate Policy

The gate policy may contain:

- `claim`: `observed` or `improves`;
- `expectedManifestHash`;
- `expectedBootstrapSeed`;
- `minScenarios`;
- `minCompleteRepetitions`;
- `minPairCompleteness`;
- `confidenceLevel`;
- `minConfidenceLowerBound`;
- `minTelemetryCoverage`;
- `telemetryClaims`: zero or more of `time` and `tokens`.

Real `run` requires a valid manifest-hash pin. `aggregate` additionally requires a non-null bootstrap-seed pin. An improves gate requires both pins and the original paired runs so the report can be recomputed.

## Real Runtime Capability

Real evaluation is opt-in only:

```bash
GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs run ...
```

Unset, `0`, `true`, or any value other than exact `1` returns `REAL_MODE_REQUIRED` before the runtime handler is called. A missing executable returns `RUNTIME_MISSING` with exit 4; the evaluator never substitutes mock output.

| Runtime / platform | Current evaluator behavior |
|---|---|
| Synthetic controls / all CI platforms | Offline only; no real adapter or credential inspection. |
| Codex / macOS or Linux | Refused with `SESSION_SAFETY_UNAVAILABLE` before workspace preparation or launch. Detached or re-parented descendant containment is not proven with the Node.js standard library. |
| Codex / Windows | Refused with `SESSION_SAFETY_UNAVAILABLE`; process-tree termination is not proven with the Node.js standard library. |
| Claude / all platforms | Missing binary: `RUNTIME_MISSING`. Installed binary: refused with `SESSION_SAFETY_UNAVAILABLE` because workspace-only containment is unproven. |
| Antigravity / all platforms | Missing binary: `RUNTIME_MISSING`. Installed binary: refused with `SESSION_SAFETY_UNAVAILABLE` until non-persistence and workspace containment are proven. |

The Codex argv contract is unit-tested with `shell:false`, an explicit workspace, an isolated HOME/TMP, `--ephemeral`, ignored user config, strict config, workspace-write sandboxing, a runner-owned closed output schema, and no inherited shell environment. On Windows, executable resolution accepts only native `.exe` or `.com` files and rejects `.cmd` or `.bat` shims so this direct-launch boundary cannot silently become a shell launch. The production gate currently blocks before this command is launched. The harness adds no provider SDK or new runtime.

### Real-Run Unlock Contract

Host process-group handling is not sufficient to open the Codex gate. The recommended future route is a manually approved, disposable Linux execution boundary backed by a dedicated cgroup v2 or equivalently isolated container supervisor. It must remain disabled until all of the following are mechanically proven:

- the supervisor owns the complete descendant boundary, including `setsid` and re-parented processes, and proves the boundary empty before evidence persistence;
- timeout, client crash, non-zero exit, and cleanup failure kill the whole cgroup/container and produce no candidate artifact;
- the image and containment policy are immutable and pinned; the container is non-privileged, non-root, capability-dropped, `no-new-privileges`, PID/resource-limited, and has no Docker socket or broad host mount;
- only the synthetic arm workspace, isolated HOME/TMP, runner-owned schema, and required runtime files are mounted; the oracle remains outside the agent-writable boundary;
- network and credential delivery are separately approved, minimally scoped, non-persistent, excluded from argv and artifacts, and never available to public CI;
- the run schema pins the containment profile, image digest, and network-policy identity so baseline and governed arms cannot use different execution boundaries;
- macOS and Windows remain fail-closed unless they later provide equivalent mechanically tested descendant containment.

[Linux cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) exposes `cgroup.kill` for a cgroup and all descendants. [Docker container controls](https://docs.docker.com/reference/cli/docker/container/run) expose the required non-privileged, capability, read-only, PID-limit, network, and `no-new-privileges` controls, but merely invoking Docker is not proof that this contract was satisfied. A private/manual workflow must also use a [GitHub approval-gated environment](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) before any job can access a runtime credential. Implementing that route changes the execution and evidence contract and therefore requires explicit architecture, secret-use, dependency, and external-runtime authorization.

## Privacy, Process, and Persistence Boundary

- Real `run` accepts only clean committed synthetic data; private, tenant, customer, and production content are prohibited.
- Each child invocation has a 65,536-byte combined stdout/stderr limit. Overflow is rejected before decode or parse; output is never truncated into a valid prefix.
- Bounded child output is privacy-scanned before fatal UTF-8 decode. Any structured runtime or oracle evidence accepted by the harness must match its exact closed contract.
- Raw stdout/stderr, decoded transcripts, raw tool traces, environment variables, credentials, private prompts, masked private excerpts, absolute home paths, file contents, and raw diff hunks are never persisted or reflected in error envelopes.
- Child environments are freshly allowlisted. The harness never spreads or serializes `process.env`.
- Every POSIX child outcome must prove absence of the original process group; timeout performs bounded terminate/kill/reap handling. Node.js standard-library process groups cannot prove that a child did not call `setsid` or re-parent outside that group.
- Temporary workspaces, isolated HOME/TMP, oracle mirrors, and intermediate files are removed before persistence. Cleanup uncertainty returns `CLEANUP_FAILED` with no artifact.
- Privacy-scanner, output-schema, containment, oracle-integrity, process-tree, or persistence failures fail closed. Real execution never degrades to a weaker mode.
- Published JSON uses a new file, same-directory private temporary state, file sync, atomic no-replace publication, and parent-directory sync where supported.

A child timeout or non-zero exit is safe evidence rather than a CLI infrastructure error: the oracle still runs, `deliveryPass` is false, and the paired run may exit 0 with `CHILD_TIMEOUT` or `CHILD_EXIT_NONZERO` in the execution evidence. Privacy, containment, oracle, cleanup, or persistence failure overrides that behavior and produces no run artifact.

## JSON and Exit Contract

Successful commands emit exactly one closed JSON receipt on stdout. Fatal errors emit exactly one closed error envelope on stderr with a stable code, fixed message, fixed suggestion, and no dynamic private value.

| Exit | Meaning |
|---:|---|
| 0 | Safe controls, validation, replay, paired-run, aggregate, or passing-gate result. |
| 1 | Valid evidence was evaluated and the claim gate rejected it; `GATE_REJECTED` is stdout data. |
| 2 | Usage, input, preregistration, classification, path, manifest, or adapter-capability refusal. |
| 3 | Infrastructure, post-launch privacy, output, oracle, containment, process, cleanup, or persistence failure. |
| 4 | Requested real runtime executable is missing; no mock artifact. |

Notable stable codes:

| Boundary | Codes |
|---|---|
| Real opt-in / data | `REAL_MODE_REQUIRED`, `DATA_CLASSIFICATION_BLOCKED`, `SCENARIO_NOT_COMMITTED` |
| Artifact / path | `ARTIFACT_HASH_MISMATCH`, `PATH_POLICY_BLOCKED`, `SYMLINK_INPUT_BLOCKED`, `PRIVACY_SOURCE_BLOCKED` |
| Runtime capability | `RUNTIME_MISSING`, `SESSION_SAFETY_UNAVAILABLE`, `PROCESS_TREE_UNAVAILABLE`, `MINIMAL_ENV_VIOLATION` |
| Child output | `CHILD_SPAWN_FAILED`, `OUTPUT_LIMIT_EXCEEDED`, `OUTPUT_SCHEMA_INVALID`, `PRIVACY_OUTPUT_BLOCKED`, `PRIVACY_SCANNER_UNAVAILABLE` |
| Integrity / publication | `ORACLE_INTEGRITY_FAILED`, `WORKSPACE_CONTAINMENT_FAILED`, `CLEANUP_FAILED`, `PERSIST_FAILED` |
| Registration | `MANIFEST_MISMATCH`, `MANIFEST_HASH_MISMATCH`, `BOOTSTRAP_SEED_MISMATCH` |

## Pairing and Scoring

A run is comparable only when its attempt exists exactly once in the normalized manifest and its scenario hash, repetition ID, seed, runtime, model, config, and starter commit all match the preregistered cohort. Invalid, unregistered, mismatched, or duplicate submissions are rejected and remain visible in the aggregate report.

`deliveryPass` requires:

- completed execution;
- every acceptance check passing;
- no critical acceptance, prohibition, privacy, or document failure;
- no explicit requirement omission;
- no forbidden-path change.

Winner selection is deterministic:

1. passing delivery beats failing delivery;
2. otherwise an absolute delivery-score delta of at least one point decides;
3. otherwise fewer repair rounds decides;
4. otherwise the result is a tie.

Time and token telemetry never make a failed arm win. They are comparable only when both arms pass and both expose trustworthy available telemetry.

## Claim Gate

`claim: observed` is limited to the named preregistered cohort and reports observed deltas only. It must not be generalized to other projects, models, runtimes, configurations, or users.

An `improves` claim cannot lower these floors:

| Requirement | Minimum |
|---|---:|
| Preregistered scenarios | 5 |
| Complete paired repetitions per scenario | 3 |
| Pair completeness | 90% |
| Bootstrap confidence level | 95% |
| Delivery-pass confidence-interval lower bound | Strictly above 0 |
| Coverage for each claimed time/token metric | 80% |

The improves gate also requires:

- the expected manifest hash and bootstrap seed are pinned;
- the supplied paired runs recompute to the exact report;
- no rejected attempt;
- a non-negative mean delivery-pass delta;
- no new critical scope, prohibition, privacy, or document regression.

Gate rejection is evidence, not an infrastructure crash. Keep the failure codes visible and make only an observed-delta statement when the improves policy does not pass.

## Non-Claims

The evaluator does not establish:

- Q1-Q9 intake or interview quality;
- semantic equivalence between private sources and normalized requirements;
- product or technology suitability;
- truth of a human approval;
- universal improvement across projects or models;
- external adoption;
- time or token benefit without the required telemetry coverage;
- production readiness from offline controls, generated plans, or runtime proof.
- complete descendant containment from original-process-group absence alone.

There is no LLM-as-judge in the release gate and no private conversation archive, hosted telemetry, provider SDK, daemon, or persistent agent process.

## Public CI and Release Use

Public CI must run only deterministic offline checks:

```bash
npm run test:governance
npm run test:governance-impact
npm run validate:governance-impact
npm run eval:governance
```

The CI workflow and `npm run ci` must not set or invoke `GOVERNANCE_IMPACT_REAL`. A real paired run is a separate maintainer action with explicit synthetic inputs and an operator-provisioned safe runtime.

Before publishing any evidence statement:

1. identify the exact cohort and claim level;
2. retain the preregistered manifest, policy, paired-run commitments, and aggregate report;
3. run `gate` with the original paired runs;
4. report rejections, missing pairs, regressions, and unavailable telemetry;
5. use “observed” wording unless the improves gate exits 0.
