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
| OCI `preflight` receipt | One credential-free Linux inspection observed the exact image/runtime and canonical boundary-policy identity, then proved its temporary boundary clean. | Image attestation, approval to use a credential, a real paired run, or Criterion 4 completion. |
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

GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs preflight
  --model <exact-model-id>
  --runtime-image <registry/repository@sha256:digest>
  --codex-version <exact-single-line-version>
  --codex-binary-sha256 <64-lowercase-hex>
  --timeout-ms <1..600000>
  --output <preflight-receipt.json>

GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs run
  --scenario <scenario-directory>
  --manifest <manifest.json>
  --policy <policy.json>
  --preflight-receipt <preflight-receipt.json>
  --attempt-id <64-lowercase-hex>
  --output <paired-run.json>
  --runtime-image <registry/repository@sha256:digest>
  --codex-version <exact-single-line-version>
  --codex-binary-sha256 <64-lowercase-hex>
  --timeout-ms <1..600000>

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

`run` has no runtime, model, config, seed, or repetition override. Those values come from the preregistered manifest. For the schema-v2 Linux/Codex route, the provenance and timeout flags are safety pins: they must exactly match the human-reviewed receipt, while the manifest model and `executionBoundaryId` must match that receipt and the fresh preflight observation.

### Command Semantics

| Command | Behavior | Persistent output |
|---|---|---|
| no argument | Validates and scores the five offline controls. | None |
| `validate` | Requires a tracked, staged/unstaged-clean scenario, verifies all four artifact hashes, and optionally normalizes a manifest and checks policy pins. A policy requires a manifest. | None |
| `preflight` | On Linux only, performs credential-free image, runtime, hardening, network/proxy-policy, PID-namespace, cgroup, and cleanup checks. | Closed `READY + NOT_EVALUATED` receipt |
| `replay` | Reopens and rehashes the scenario, verifies run/manifest identity, and scores an existing paired run without launching an agent. Run `validate` first in the public workflow. | Closed scored result |
| `run` | Requires exact real opt-in; clean committed synthetic scenario, receipt, manifest, and policy; exact receipt/provenance/model/timeout/boundary agreement; an available safe adapter; and a new output path. | Closed paired-run evidence after cleanup |
| `aggregate` | Re-scores submitted runs, rejects non-comparable or duplicate attempts, applies the policy bootstrap seed, and commits accepted-run hashes into one report. | Closed aggregate report |
| `gate` | Re-validates the report and policy; an improves claim also recomputes the report from the supplied paired runs. | None |

The term “paired run” refers to the closed `governance-impact-run` schema. It never means raw model stdout/stderr, a transcript, a tool trace, or a diff hunk.

Output paths must not already exist. `replay`, `run`, and `aggregate` reject repository escapes or symlinked output parents before publication and never overwrite evidence.

## Credential-Free Preflight And Operator Sequence

The preflight and real workflows are intentionally separate manual actions. The preflight workflow has no GitHub Environment and no secret reference. It sets the exact real-mode opt-in only to enter the OCI code path; it does not read `OPENAI_API_KEY`.

1. Review a pullable, digest-pinned image and record the exact Codex version line, raw executable SHA-256, model, and per-arm timeout.
2. Dispatch `.github/workflows/governance-impact-preflight.yml` with those exact values and an output such as `artifacts/governance-impact/preflight-<review-id>.json`.
3. Download and review the exact receipt. Require `preflightStatus: "READY"`, `claimDisposition: "NOT_EVALUATED"`, the expected provenance/model/timeout, all hardening flags `true`, `pidNamespaceStopped: true`, `cgroupEmpty: true`, and `cleanupComplete: true`.
4. Add the reviewed receipt to the repository. Pin its `executionBoundaryId` in a schema-v2 manifest, recompute the manifest attempts and policy hash pin as required, then human-review and commit the receipt, manifest, policy, and synthetic scenario. The real command rejects any of those inputs when untracked or dirty.
5. Configure the `governance-impact-real` GitHub Environment with required reviewers and the `OPENAI_API_KEY` secret. Separately review the disposable Linux host, cgroup v2, Docker, `sudo -n`, `nsenter`, and the exact relay command boundary.
6. Dispatch `.github/workflows/governance-impact-real.yml` with the committed receipt path and the same provenance and timeout. After Environment approval, `run` performs a fresh credential-free preflight and compares the receipt, manifest cohort, and observed boundary. It reads the provider credential only after every comparison succeeds.
7. Treat success as one eligible paired observation only. Preserve the receipt, manifest, policy, paired run, and later aggregate/gate evidence; record failures without converting them into a weaker run.

Equivalent local commands on an explicitly approved disposable Linux host are:

```bash
GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs preflight \
  --model "$MODEL" \
  --runtime-image "$RUNTIME_IMAGE" \
  --codex-version "$CODEX_VERSION" \
  --codex-binary-sha256 "$CODEX_BINARY_SHA256" \
  --timeout-ms "$TIMEOUT_MS" \
  --output "$PREFLIGHT_RECEIPT"

# Stop here. Human-review and commit the receipt, schema-v2 manifest, policy,
# and synthetic scenario before authorizing credential access.

GOVERNANCE_IMPACT_REAL=1 OPENAI_API_KEY="$OPENAI_API_KEY" \
  node scripts/governance-impact-eval.mjs run \
  --scenario "$SCENARIO" \
  --manifest "$MANIFEST" \
  --policy "$POLICY" \
  --preflight-receipt "$PREFLIGHT_RECEIPT" \
  --attempt-id "$ATTEMPT_ID" \
  --output "$OUTPUT" \
  --runtime-image "$RUNTIME_IMAGE" \
  --codex-version "$CODEX_VERSION" \
  --codex-binary-sha256 "$CODEX_BINARY_SHA256" \
  --timeout-ms "$TIMEOUT_MS"
```

A receipt is a closed observation from one preflight, not an attestation or a reusable authorization. The real run always repeats preflight and must match the committed receipt; review and commit are human gates and are not automated by either workflow.

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

- `schemaVersion: 1` with cohort fields `runtime`, `model`, `config`, and `starterCommit`; or
- `schemaVersion: 2` with the same cohort plus the reviewed 64-lowercase-hex `executionBoundaryId`;
- one or more attempts: `attemptId`, `scenarioHash`, `repetitionId`, and `seed`.

`attemptId` is derived from the schema version, scenario hash, repetition ID, seed, and all cohort fields. A v2 boundary change therefore changes every attempt identity. Duplicate attempt IDs or duplicate scenario/repetition pairs are invalid. Normalization sorts attempts deterministically and produces the `manifestHash` used by the policy.

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
| Codex / macOS or Linux | Refused with `SESSION_SAFETY_UNAVAILABLE` for the legacy host adapter before workspace preparation or launch. Host process groups do not prove detached or re-parented descendant containment. |
| Codex / Linux OCI schema v2 | Scheme A is implemented behind a credential-free committed receipt, exact boundary matching, and manual Environment approval. It remains operationally `BLOCKED` until live Linux/cgroup-v2, narrowly reviewed `sudoers`/`nsenter`, pullable-image provenance, and provider evidence are captured. |
| Codex / Windows | Refused with `SESSION_SAFETY_UNAVAILABLE`; process-tree termination is not proven with the Node.js standard library. |
| Claude / all platforms | Missing binary: `RUNTIME_MISSING`. Installed binary: refused with `SESSION_SAFETY_UNAVAILABLE` because workspace-only containment is unproven. |
| Antigravity / all platforms | Missing binary: `RUNTIME_MISSING`. Installed binary: refused with `SESSION_SAFETY_UNAVAILABLE` until non-persistence and workspace containment are proven. |

The legacy Codex argv contract is unit-tested with `shell:false`, an explicit workspace, an isolated HOME/TMP, `--ephemeral`, ignored user config, strict config, workspace-write sandboxing, a runner-owned closed output schema, and no inherited shell environment. On Windows, executable resolution accepts only native `.exe` or `.com` files and rejects `.cmd` or `.bat` shims so this direct-launch boundary cannot silently become a shell launch. Scheme A invokes only `/opt/governance/runtime/codex` from the reviewed image and adds no provider SDK or daemon.

### Real-Run Unlock Contract

Host process-group handling is not sufficient to open the Codex gate. Scheme A uses a manually approved disposable Linux OCI boundary:

- the container has private PID and cgroup namespaces, a non-root user, read-only root filesystem, `cap-drop=ALL`, `no-new-privileges`, PID/CPU/memory limits, no device, Docker socket, or cgroup mount, and only narrow workspace/runtime mounts;
- the supervisor captures the container init host PID, resolves its unified cgroup path, and accepts only a stopped PID namespace plus `cgroup.events` `populated 0` (or independently observed kernel removal after stop);
- the PID-1 lifeline closes on completion, timeout, disconnect, or supervisor loss; termination of PID 1 causes Linux to kill all remaining processes in that PID namespace, including detached descendants;
- timeout, relay/proxy failure, client crash, and cleanup uncertainty produce no candidate artifact unless the closed boundary and required cleanup are proven;
- `executionBoundaryId` hashes the observed image digest, exact Codex version and binary hash, and canonical containment, network, and proxy policy hashes; the receipt, v2 manifest, fresh preflight, and both arms must use one value;
- macOS, Windows, Claude, Antigravity, and the legacy host Codex adapter remain fail-closed.

Docker `NetworkMode=none` gives the container only its loopback device. Scheme A does not bind-mount the host Unix-domain socket into the container. After the container init PID is known, the host starts a narrowly scoped `sudo -n nsenter --net=/proc/<init-pid>/ns/net --setgid=<host-gid> --setuid=<host-uid> -- <node> scripts/governance-impact-uds-relay.mjs` process. It enters only the container network namespace, drops back to the invoking host identity before executing the relay, and listens on `127.0.0.1:43127` while retaining the host mount namespace so it can connect to the caller-owned ephemeral UDS. Relay secrets and configuration are not inherited through `sudo` environment preservation: the parent sends one bounded closed configuration line over the relay's private stdin, and the remaining pipe lifetime is the relay lifeline; EOF initiates shutdown. Relay readiness is required before the PID-1 lifeline is released.

The host proxy permits up to 32 attempt-bound `POST /v1/responses` requests, with at most one active at a time, under an exact bearer, attempt ID, model, upstream, 1 MiB request cap, 4 MiB response cap, and one attempt deadline. Each request must set `store: false` and `stream: true`; `background` must be absent or `false`; `previous_response_id`, `conversation`, `prompt`, nested item/file/container references, and remote input URLs are forbidden; client identifiers are stripped; and tools are limited to client-executed `function`, `custom`, `local_shell`, `apply_patch`, and `tool_search`. `tool_search` descriptors and replayed calls must explicitly declare client execution; server-side hosted tools are rejected.

This bounded request count supports a client-side tool loop: Codex may submit a new self-contained request after executing an allowed tool, but it cannot continue through provider-held response, conversation, prompt, item, file, or container state. SSE is forwarded progressively through both relay hops with backpressure, the 4 MiB per-response ceiling, and the attempt deadline; it is not buffered until completion. A quota or transport failure after headers closes the stream and makes the attempt ineligible. Non-SSE responses remain bounded before forwarding. Neither proxy records bodies, bearer values, authorization headers, raw output, or token content. This is a closed request-policy design, not a claim that a live Codex/provider tool loop is compatible; compatibility remains unproven until the authorized live run succeeds.

This request contract is explicit because the [OpenAI data controls documentation](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) states that Responses API application state is retained by default and that background mode stores response data temporarily. `store: false` and no background are required here, but they do not establish Zero Data Retention or eliminate provider-side abuse-monitoring retention.

[Linux PID namespace documentation](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html) defines the PID-1 termination behavior. [Linux cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) defines recursive `populated` state and `cgroup.kill`. [Docker's none network driver](https://docs.docker.com/engine/network/drivers/none/) creates only loopback. A private/manual workflow uses a [GitHub approval-gated environment](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) so protection rules pass before the real job can access its Environment secret.

The implementation and offline/injected tests do not unlock Criterion 4. It remains `BLOCKED` until a reviewed final commit has live evidence from the actual disposable Linux/cgroup-v2 host, `sudo -n`/`nsenter` availability and the exact allowed command, the bounded stdin configuration/lifeline, real netns-to-host-UDS behavior, the digest-pinned image and Codex provenance, the provider request/stream path, whole-boundary teardown cases, cleanup, and a real paired run. No `sudoers env_keep` is required or permitted for relay secrets. A mock proxy, fixture runtime, design review, `READY` receipt, or hosted Environment approval cannot substitute for that evidence.

## Privacy, Process, and Persistence Boundary

- Real `run` accepts only clean committed synthetic data; private, tenant, customer, and production content are prohibited.
- Schema-v2 Linux/Codex `run` also requires the receipt, manifest, and policy to be tracked and clean. The receipt is revalidated against the exact provenance, model, timeout, manifest boundary, and fresh observed boundary before credential access.
- Each child invocation has a 65,536-byte combined stdout/stderr limit. Overflow is rejected before decode or parse; output is never truncated into a valid prefix.
- Bounded child output is privacy-scanned before fatal UTF-8 decode. Any structured runtime or oracle evidence accepted by the harness must match its exact closed contract.
- Raw stdout/stderr, decoded transcripts, raw tool traces, environment variables, credentials, private prompts, masked private excerpts, absolute home paths, file contents, and raw diff hunks are never persisted or reflected in error envelopes.
- Child environments are freshly allowlisted. The harness never spreads or serializes `process.env`.
- Legacy POSIX child outcomes prove absence of the original process group, but that does not prove a child did not call `setsid` or re-parent outside that group. Scheme A instead requires the PID namespace stopped and its cgroup-v2 subtree empty.
- OCI preflight and boundary comparison do not read the provider credential. After a match, the host proxy receives the upstream key lazily; the container receives only an attempt-scoped random bearer and loopback base URL. No upstream key or host UDS is mounted into the container.
- Provider requests are closed to `store: false`, progressive `stream: true`, no background or server-side conversation/prompt state, stripped client identifiers, and client-executed tools only. A client-side loop may make at most 32 sequential requests; each request is capped at 1 MiB and each response at 4 MiB under one attempt deadline.
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
| 4 | A requested real-runtime prerequisite is unavailable or uncertain before launch; no mock artifact. |

Notable stable codes:

| Boundary | Codes |
|---|---|
| Real opt-in / data | `REAL_MODE_REQUIRED`, `DATA_CLASSIFICATION_BLOCKED`, `SCENARIO_NOT_COMMITTED`, `EVIDENCE_NOT_COMMITTED` |
| Artifact / path | `ARTIFACT_HASH_MISMATCH`, `PATH_POLICY_BLOCKED`, `SYMLINK_INPUT_BLOCKED`, `PRIVACY_SOURCE_BLOCKED` |
| Runtime capability | `RUNTIME_MISSING`, `SESSION_SAFETY_UNAVAILABLE`, `PROCESS_TREE_UNAVAILABLE`, `MINIMAL_ENV_VIOLATION` |
| OCI preflight / identity | `OCI_PROVENANCE_INVALID`, `OCI_PREFLIGHT_RECEIPT_INVALID`, `EXECUTION_BOUNDARY_MISMATCH`, `RUNTIME_CREDENTIAL_UNAVAILABLE` |
| OCI relay / boundary | `OCI_PROXY_RELAY_UNAVAILABLE`, `OCI_BOUNDARY_PROOF_UNAVAILABLE`, `OCI_CLEANUP_UNCERTAIN` |
| Child output | `CHILD_SPAWN_FAILED`, `OUTPUT_LIMIT_EXCEEDED`, `OUTPUT_SCHEMA_INVALID`, `PRIVACY_OUTPUT_BLOCKED`, `PRIVACY_SCANNER_UNAVAILABLE` |
| Integrity / publication | `ORACLE_INTEGRITY_FAILED`, `WORKSPACE_CONTAINMENT_FAILED`, `CLEANUP_FAILED`, `PERSIST_FAILED` |
| Registration | `MANIFEST_MISMATCH`, `MANIFEST_HASH_MISMATCH`, `BOOTSTRAP_SEED_MISMATCH` |

## Pairing and Scoring

A run is comparable only when its attempt exists exactly once in the normalized manifest and its scenario hash, repetition ID, seed, runtime, model, config, starter commit, and—under schema v2—`executionBoundaryId` all match the preregistered cohort. Both arms must also carry identical closed boundary evidence. Invalid, unregistered, mismatched, or duplicate submissions are rejected and remain visible in the aggregate report.

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
- Criterion 4 completion from unit tests, injected Docker clients, fixture images, a `READY` preflight receipt, or Environment approval;
- provenance attestation or image trust from observed digest/version/hash equality alone;
- Zero Data Retention, absence of provider abuse-monitoring retention, or provider policy compliance from `store: false`;
- automatic human review, approval, or commit of the receipt, manifest, policy, image, `sudoers`, or provider path.
- live Codex compatibility with the bounded, no-server-state client tool loop before an authorized provider run proves it.

There is no LLM-as-judge in the release gate and no private conversation archive, hosted telemetry, provider SDK, background response, server-side conversation chain, daemon, or persistent agent process.

## Public CI and Release Use

Public CI must run only deterministic offline checks:

```bash
npm run test:governance
npm run test:governance-impact
npm run validate:governance-impact
npm run eval:governance
```

The public push/pull-request workflow and `npm run ci` must not set or invoke `GOVERNANCE_IMPACT_REAL`, access a runtime credential, or run Docker/provider integration. The credential-free preflight workflow and approval-gated real workflow are separate `workflow_dispatch` maintainer actions; neither is part of public CI.

Before publishing any evidence statement:

1. identify the exact cohort and claim level;
2. retain the preregistered manifest, policy, paired-run commitments, and aggregate report;
3. run `gate` with the original paired runs;
4. report rejections, missing pairs, regressions, and unavailable telemetry;
5. use “observed” wording unless the improves gate exits 0.
