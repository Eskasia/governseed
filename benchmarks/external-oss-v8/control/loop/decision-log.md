# GovernSeed effectiveness benchmark decision log

## 2026-08-04 — Canonical full experiment contract is incomplete

- Status: `BLOCKED_EXPERIMENT_CONTRACT_INCOMPLETE`
- Verified main: `502c92e76e111a4cffbfaf4c3e4bde7f9bf8ce08`
- The V8 README explicitly limits V8 to G1-style external-observational runtime and cache evidence and excludes hidden oracle, provider execution, formal lock, Pilot, and scoring.
- V4 contains a draft lock and schemas, but no committed source declares V4 authoritative for V8 or carries its values forward.
- No V8 canonical contract freezes the Pilot and confirmatory run counts, randomization or arm ordering, baseline/treatment definitions, metrics, effect-size method, scoring schema, or acceptance threshold.
- Decision: do not inherit V4 values, infer missing values, enter G3, or start Pilot. A separate decision Issue is required after the loop control becomes canonical.

## 2026-08-04 — G2 top-level gate conflicts with later evidence

- Status: `EVIDENCE_CONFLICT`
- `control/G2/gate.json` says `humanApprovalPresent=false`, `providerRequestCount=0`, `runtimeIdentityWorkflow=NOT_CREATED`, and `runtimeCanary=NOT_RUN`.
- `credential-transport/human-approval-repair-2-attempt-5.json` says attempt 5 is approved and points to GitHub comment `5176356972`.
- Its verified source record simultaneously says `newProviderRequestAuthorized=false`, `credentialPresent=false`, and `rerunPermitted=false`; the broad scope list cannot be used as a new provider authorization.
- `.github/workflows/external-oss-v8-runtime-identity.yml` exists on main.
- Failed run `30850478318` says `workflowDispatch=RUN`, `runtimeCanary=FAIL`, and `providerRequestAttempt=INDETERMINATE`.
- Decision: no record is silently preferred. G2 remains blocked, and successful receipt count zero is not interpreted as provider request count zero.

## 2026-08-04 — Repair-6 approval is bound to PR 81 but attached to PR 80

- Status: `EVIDENCE_CONFLICT`
- GitHub comment `5178485510` names repair-6, binds PR `#81` final head `41383da9d292ed1e8220890cfa8bffca4f0cc2c0` and tree `f386cefe5d79c83675a3965fdaaa14bbddc46333`, and approves technical merge preparation only.
- The comment is attached to already merged PR `#80`, while PR `#81` has zero reviews/comments and its attempt-6 packet still says `PENDING_HUMAN_REVIEW`, `approvedRecordPresent=false`, and `overallGate=BLOCKED`.
- The comment itself requires a formal repair-6 approval record and sanitized source evidence before PR `#81` may merge.
- Decision: PR `#81` is mechanically green but not `READY_TO_MERGE`; do not dispatch or infer provider authorization.

## 2026-08-04 — Preserved G2 failures are immutable and not rerunnable

- Run `30814159615`: preserved failure; rerun forbidden.
- Run `30824406710`: preserved failure; rerun forbidden.
- Run `30850478318`: preserved failure; upstream attempt indeterminate; approved request possibly consumed; rerun forbidden.
- Decision: each future canary must use a new workflow dispatch, new run ID, exact current main SHA, `github.run_attempt=1`, and a fresh GitHub Environment approval.

## 2026-08-04 — GitHub reconciliation

- Active G2 repair: PR `#81`, head `41383da9d292ed1e8220890cfa8bffca4f0cc2c0`, tree `f386cefe5d79c83675a3965fdaaa14bbddc46333`; three platform validation jobs passed in run `30899414374`.
- Active loop-control PR: draft PR `#83`; technical head `c8cdfc3a608b3ff9b886ab516c3a29a67854b362`, tree `f639e1a3673007146c1417897ab8abe09fd963bc`; three platform validation jobs passed in run `30911942323`.
- PRs `#54`, `#55`, `#60`, `#62`, `#65`, and `#66` are stale or superseded candidates because later repairs or merged V8 evidence are on main. They are not auto-closed by this node.
- No open tracking Issue existed at intake. Issue `#82` now owns P0.4.

## 2026-08-04 — P0.4 independent review repair

- Status: `IN_PROGRESS`
- Independent checker and evidence auditor rejected technical head `c8cdfc3a608b3ff9b886ab516c3a29a67854b362` for stale PR metadata, an unbound cycle result, one local absolute worktree path, and insufficient tests for append behavior and human-gate records.
- Decision: preserve the technical head/tree in a new append-only reconciliation record; redact the unaccepted local path before merge; update PR `#83` state; and add deterministic coverage for multi-line ledger append semantics, current human-gate fields, decision-log markers, and local-path absence.
- This repair changes only P0.4 control metadata and tests. It does not alter G1/G2 evidence or dispatch a workflow.

## 2026-08-04 — Final-head binding is external

- Status: `IN_PROGRESS`
- A Git commit cannot include its own commit SHA. Therefore committed control files may bind only prior technical evidence; they must not label that SHA or its CI run as the current or final PR head.
- Decision: the exact final PR head/tree, fresh CI run, and independent checker verdicts are bound in a GitHub PR comment and repeated in the human gate packet. Any subsequent push invalidates that external binding and requires a new one.
- This rule prevents a passing local test from certifying stale PR metadata.

## 2026-08-04 — Attempt accounting repair

- Status: `IN_PROGRESS`
- A fresh resume audit found P0.4 recorded one attempt while its append-only ledger contained four selected-node cycles; P0.1 had been incorrectly raised from one to four by an ambiguous mechanical edit.
- Decision: restore P0.1 to its evidence-backed count, record C005 as P0.4 attempt five, and require the active node attempt count to equal its ledger entry count.
- The six-cycle ceiling remains fail-closed; this repair uses attempt five and leaves one bounded repair cycle available.

## 2026-08-04 — Local UDS relay processes are inadmissible evidence

- A stale local `uds-relay.test.mjs` process tree from the repair-1 worktree has remained alive since 2026-08-02.
- It is not bound to a sanctioned G2 GitHub run or current main commit and therefore cannot satisfy any gate.
- Decision: classify it as local leaked test residue. Do not use it as runtime, cleanup, credential-isolation, or request-count evidence.

## 2026-08-04 — P0.4 merge reconciliation

- Status: `PASS`
- GitHub API reports PR `#83` merged at `2026-08-04T13:56:04Z` by repository owner `Eskasia` from exact head `f8bdf152c3d0481e4b4a391130f49f7266509efb`.
- Git proves that reviewed head and merge commit `12f1802173c05e880139a2841900e6953d16d42d` both have tree `2eee3c5237d3ef7cda947e3cb843eddd50668f69`.
- Owner approval comment <https://github.com/Eskasia/governseed/pull/83#issuecomment-5180050104> was created at `2026-08-04T13:55:12Z`, fifty-two seconds before merge, and authorizes only readying and merging that exact control-only head.
- Issue `#82` closed through PR `#83`; main validation run `30916308174` passed on Ubuntu, macOS, and Windows.
- The runtime-identity workflow has no run after `30850478318` on `2026-08-03T20:30:07Z`; this reconciliation dispatched no workflow and consumed no provider request.
- Decision: P0.4 satisfies its acceptance criteria and contributes its `2.5%` canonical-node weight, raising evidence-weighted completion from `21.5%` to `24.0%`.

## 2026-08-04 — P0.D1 experiment-contract decision gate

- Status: `HUMAN_GATE`
- Strict READY is empty after P0.4 closes because P0.1/P0.2 remain blocked by the missing canonical experiment contract, G2 retains evidence conflicts and human gates, and no later node has all dependencies satisfied.
- P0.D1 is the only safe critical-path gate-preparation action that can unblock P0.1/P0.2 and later G3/Pilot work.
- Issue `#84` records all missing preregistration fields, the non-authoritative V4 boundary, forbidden actions, acceptance criteria, and a paste-ready implementation-only decision template.
- Draft PR `#85` persists the P0.4 reconciliation and P0.D1 gate state; it is not authorized for ready/merge while the decision is missing.
- Decision: do not infer V4 values. Stop state-changing experiment work at `EXPERIMENT_CONTRACT_DECISION` until a complete repository-owner comment exists and is verified against its GitHub `created_at`.

## 2026-08-04 — Owner decision exists but TASK-OSS-01 fails its adoption condition

- Status: `EVIDENCE_CONFLICT`
- GitHub comment <https://github.com/Eskasia/governseed/issues/84#issuecomment-5185865928> is an `OWNER` comment by `Eskasia`, created and last updated at `2026-08-04T23:48:25Z`; the exact UTF-8 API `.body` string without an added delimiter has SHA-256 `12263c44592a5e7a038e51ede76beeccc637ea4904681b3a03817a66b386a3f5`.
- The comment authorizes contract implementation and review only, binds main `12f1802173c05e880139a2841900e6953d16d42d`, and conditions R1 adoption of V4 task identities on revalidation of their committed hashes.
- The declared scorer hashes match current main exactly: schema `90fd773ccad80fafc23d6b51a003821efa04a08f9a441639a3a0b4af3a63c955` and implementation `cf5789192f6630dc7686c6c393a28eff5b23f896a3658ca626a6cb6296fd9daa`.
- TASK-OSS-03 and TASK-OSS-09 match across V4 and V5 for repository, legacy seed identity, public test, path policy, hidden-oracle identity, and parent-red/fix-green evidence.
- TASK-OSS-01 matches those fields except seed-tree reproduction: V4 binds seed commit `0ad23a4f16331512f49c570acc2e9ff8093c8248` and tree SHA-256 `88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa`, while committed V5 evidence records `legacyV3SeedTreeHashReproduced=false` and reconstructs seed `15ba6bed78feebe392dfbe13cf0be4065b260af7` with tree SHA-256 `3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e`.
- At the pre-implementation observation no Actions run existed after the decision. The later evidence-only push created non-provider `Validate GovernSeed` run `30961663119`; the Runtime Identity workflow still has no run after historical `30850478318`, and no provider-consuming workflow was dispatched.
- Decision: do not implement R1 with an unverified V4 seed and do not silently substitute the V5 seed, because the owner comment says a task-identity change creates R2. Require either reproducible evidence for the V4 TASK-OSS-01 seed tree or an owner-approved new revision bound to the V5 identity.

## 2026-08-05 — Owner-comment hash canonicalization correction

- Status: `PASS_EVIDENCE_REPAIR`; the task-identity gate remains `EVIDENCE_CONFLICT`.
- The prior digest `0aca84e3a9468235cb1a96ab14e200d8f3dd4cc1540c4f61e9e0c1f151e588c3` was reproduced only after appending one LF byte to the API body. It is retained as `cliBodyWithTrailingLfSha256`, not as the canonical body hash.
- The canonical provenance digest is `12263c44592a5e7a038e51ede76beeccc637ea4904681b3a03817a66b386a3f5`, computed over the exact UTF-8 JSON `.body` string with no output delimiter.
- Fresh GitHub reconciliation confirms main and PR `#85` are unchanged, Issue `#84` has no new task-identity resolution comment, scorer hashes remain `2/2` exact, and Runtime Identity still contains only the three forbidden historical runs.
- Decision: correct the provenance and workflow-history records without interpreting the absent resolution as authorization. Contract implementation remains `NOT_RUN`.

## Claim boundary

## 2026-08-05 — R2 task identity resolution and contract implementation

- Status: `P0.D1 PASS`; `P0.1 HUMAN_GATE` pending canonical merge.
- Owner comment <https://github.com/Eskasia/governseed/issues/84#issuecomment-5186392861> is by `Eskasia` with `OWNER` association, created at `2026-08-05T01:13:51Z`, and exact UTF-8 API-body SHA-256 `e8ceeb21c85538a8f279db2626f66bed541cfe8476afbcf4604507f4ebff4191`.
- The decision supersedes R1 before execution, creates `GS-OSS-2026-08-05-EFFECT-R2`, binds TASK-OSS-01 to V5 reconstructed commit `15ba6bed78feebe392dfbe13cf0be4065b260af7` and tree SHA-256 `3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e`, preserves every other owner-contract field, and prohibits R1/R2 evidence pooling.
- R2 contract, closed top-level schema, deterministic 33-pair manifest, fail-closed gate policy, evidence hash index, report, and negative tests are implemented under `benchmarks/external-oss-effectiveness-r2/`.
- Confirmatory task identities remain explicitly missing and block formal lock. Contract implementation does not authorize provider requests, workflow dispatch, G2/G3, formal lock, Pilot, confirmatory execution, scoring, PR readiness, merge, or acceptance.
- Runtime Identity workflow history remains exactly runs `30814159615`, `30824406710`, and `30850478318`; no provider-consuming workflow was dispatched.
- Decision: close zero-weight repair node P0.D1, retain weighted completion at `24.0%`, and select P0.1 as the next READY critical-path node. Stop at `CONTRACT_PR_REVIEW_AND_MERGE` because the R2 plan is not canonical on main.

## 2026-08-05 — R2 contract merged and canonical

- Status: `P0.1 PASS`; `P0.2 PASS`.
- Owner approval <https://github.com/Eskasia/governseed/pull/85#issuecomment-5187112324> is comment `5187112324`, author association `OWNER`, created at `2026-08-05T03:14:32Z`, with exact UTF-8 API-body SHA-256 `7d06ff69617a039ac95a6113a23f440f18de4f3716016eb0eace45e9abe593f5`.
- PR `#85` merged exact reviewed head `bc0faecf12360b510ca3c4cfb6770f8fcdaffbaa` at `2026-08-05T03:14:53Z`, twenty-one seconds after approval.
- Merge commit `b812fe7e9096beee4ae8310482055648ad022d4a` and reviewed head share exact tree `e2c4dcafdcd8f5f5e2962031979039ce70432615`; main validation run `30971703749` passed on Ubuntu, macOS, and Windows.
- Issue `#84` was closed after merge provenance was posted. Runtime Identity still has no run after `30850478318`; no provider-consuming workflow was dispatched.
- Decision: the R2 contract and complete preregistration fields are canonical on main. Close P0.1 and P0.2, raising weighted completion from `24.0%` to `29.0%`.

## 2026-08-05 — P1.2 confirmatory task/oracle preparation intake

- Status: `IN_PROGRESS`.
- Strict READY contains P1.2 and human-gated repair node P3.R6. P1.2 is selected first because it is the lower-phase non-provider critical-path node.
- Issue `#86` defines exact acceptance criteria for TASK-OSS-11 through TASK-OSS-18: public provenance, parent/fix identities, sealed seed, public task/test, path policy, runner-owned hidden oracle, parent-red/fix-green evidence, and fail-closed hash validation.
- Decision: prepare and review candidate task/oracle identities offline. Do not perform formal lock, provider requests, workflow dispatch, Pilot, confirmatory arm execution, scoring, or benchmark acceptance.

## 2026-08-05 — P1.2 confirmatory task/oracle identities prepared

- Status: `HUMAN_GATE`; weighted completion remains `29.0%` until the evidence is reviewed and merged to main.
- TASK-OSS-11 through TASK-OSS-18 bind eight distinct public repositories, exact parent/fix commits, exact seed Git trees, tracked-tree SHA-256 values, public task/test hashes, allow-only path-policy hashes, and runner-owned hidden-oracle hashes.
- Each public test and each identity-separated hidden oracle was executed against its exact upstream pair: all eight parents failed and all eight fixes passed. Fresh second clones reproduced every parent commit, Git tree, and tracked-tree SHA-256.
- The recursively closed package schema and negative tests reject missing, duplicate, mismatched, exposed, cross-revision, and drifted identities. Raw hidden-oracle source is absent from the committed execution-agent surface.
- Draft PR <https://github.com/Eskasia/governseed/pull/87> carries the implementation. Runtime Identity workflow history remains exactly the three historical forbidden runs; no provider-consuming workflow was dispatched.
- Decision: stop at `TASK_IDENTITY_PR_REVIEW_AND_MERGE`. Do not count P1.2 as PASS, select P1.4, mark PR ready, merge, formal-lock, or execute any arm until an owner approves the exact final PR head/tree after green CI and independent review.

## 2026-08-05 — P1.2 independent review rejected and bounded repair applied

- One explicitly authorized provider request created fresh read-only checker `GS-EFFECT-R2-INDEPENDENT-CHECKER`; sanitized receipt `pr-87-independent-review-rejection.json` binds its `REJECT` verdict to head `86cdae157e8eec3656569790aca62c5cc61aa81a` and tree `2f80b3d0f1106341e0002b33c19147518d206943`.
- Finding `P1-CROSS-TASK-ARTIFACT-REBINDING`: the original schema allowed a package to point at another task's public artifacts, and negatives did not cover every duplicate or cross-class identity collision.
- Finding `P1-DIFF-CHECK-FALSE-CLAIM`: the original exact diff had fourteen new blank lines at EOF despite the PR body listing `git diff --check` as passing.
- Bounded repair adds schema-level taskId-to-path binding, semantic path and public-task uniqueness, cross-class artifact collision rejection, corresponding negative mutations, and EOF normalization with all dependent hashes updated.
- The rejected verdict cannot approve the repair head. A fresh independent review is `NOT_RUN` and requires a new exact one-request authorization after final head/tree and CI are externally bound.
- Decision: retain P1.2 as `HUMAN_GATE` at `29.0%`; do not mark ready, merge, dispatch a workflow, formal-lock, execute either arm, score, or accept the benchmark.

## 2026-08-05 — P1.2 repair reviews reconciled and accepted

- Status: `INDEPENDENT_ACCEPT`; P1.2 remained non-PASS pending exact-head merge.
- Fresh checker `GS-EFFECT-R2-INDEPENDENT-CHECKER-REPAIR-1` independently verified the code repair and returned a bounded `REJECT` only because the external runtime-history wording could be misread as denying historical run `30850478318` or all upstream attempts.
- The PR body and technical binding were corrected to say only that no new GitHub workflow was dispatched during C013, repair preparation, either checker, or the wording repair. Historical run `30850478318` remains `workflowDispatch=RUN`, `providerRequestAttempt=INDETERMINATE`, and `approvedSingleRequestPossiblyConsumed=true`.
- A separately authorized checker `GS-EFFECT-R2-INDEPENDENT-CHECKER-REPAIR-2` returned `ACCEPT` for exact base/head/tree `b812fe7e9096beee4ae8310482055648ad022d4a` / `d5b1c32138496a91931b20f065c39f4404505d01` / `31dc203b0bb1af2d1546a9f9df676fa945dde792`; sanitized comment `5188871233` has exact API-body SHA-256 `d0e09d1f788d4cb8e35e520bd18c1caccd3108429e1f01a54581ad04ddfe9648`.
- Two separately authorized read-only checker provider requests were consumed after C013; neither checker edited the repository or dispatched a GitHub workflow.
- Decision: satisfy `TASK_IDENTITY_INDEPENDENT_REVIEW_AUTHORIZATION` and advance only to exact-head owner merge approval. Do not infer merge, formal lock, execution, scoring, or acceptance authorization.

## 2026-08-05 — P1.2 task identities merged and canonical

- Status: `P1.2 PASS`.
- OWNER approval <https://github.com/Eskasia/governseed/pull/87#issuecomment-5189326581> is comment `5189326581`, created at `2026-08-05T08:16:34Z`, with exact API-body SHA-256 `2f08758e31ebb706375cd046097270ce86c9cc4203e3ba0c684467e1b71f6a93`.
- PR `#87` merged exact reviewed head `d5b1c32138496a91931b20f065c39f4404505d01` at `2026-08-05T08:17:06Z`, thirty-two seconds after approval. Merge commit `220c2d8d816194eb77da94e182258a0875202f3b` preserves reviewed tree `31dc203b0bb1af2d1546a9f9df676fa945dde792` exactly.
- Main validation run `30988393468` passed on Ubuntu, macOS, and Windows; Issue `#86` is closed. Runtime Identity history remains exactly the three historical manual runs and no new provider-consuming workflow was dispatched.
- Decision: close P1.2 and raise evidence-weighted completion from `29.0%` to `31.0%`. Select P1.4 as the next strict READY critical-path node.

## 2026-08-05 — P1.4 public-hidden criterion separation prepared

- Status: `HUMAN_GATE`; weighted completion remains `31.0%` until the P1.4 candidate is independently accepted and merged.
- Issue `#88` defines the static Git-surface acceptance boundary. The closed execution-agent-surface manifest exposes all eight public task and public test artifacts with canonical hashes while allowing only sanitized hidden-oracle hash metadata.
- Deterministic tests use `git ls-files` to require exactly three tracked files per task, reject missing or drifted public artifacts, cross-task rebinding, hidden source/path/content injection, exposure flags, and any extra tracked task-surface file.
- The claim is limited to committed execution-agent surface separation. It does not claim runtime mount enforcement, formal lock, provider execution, Pilot, confirmatory execution, scoring, effectiveness, or acceptance.
- Decision: stop at `PUBLIC_HIDDEN_SEPARATION_INDEPENDENT_REVIEW_AUTHORIZATION` after final head/tree and three-platform CI are externally bound. Queue P3.R6 separately; do not dispatch or merge it under this gate.

## 2026-08-05 — P1.4 independent review rejected and bounded repair applied

- One explicitly authorized provider request created fresh read-only checker `GS-EFFECT-R2-P1.4-INDEPENDENT-CHECKER`; sanitized receipt `pr-89-independent-review-rejection.json` binds its `REJECT` verdict to PR `#89` head/tree `19a4405abdeb25c20a919897ec092e85dfcbf78f` / `0ce658e5bb35c84db4b7573d7193fe88366a67da`.
- Finding `P1_4_HASH_ONLY_CLAIM_MISMATCH`: the surface claimed hash-only hidden-oracle metadata while each agent-visible task package still included sanitized parent/fix result objects.
- The bounded repair removes those result objects from all eight hidden-oracle package records and from the closed schema/tests, then refreshes package, contract, surface, and evidence-index hashes. Task, seed, public-test, hidden-oracle, scorer, runtime, provider, workflow, and formal-lock identities remain unchanged.
- Historical parent-red/fix-green evidence remains bound to the independently accepted PR `#87` reviewed tree; no result object is silently rewritten.
- Decision: retain P1.4 as `HUMAN_GATE` at `31.0%`. A fresh independent review is `NOT_RUN` for the repaired head and requires a new exact one-request authorization after final head/tree and CI are externally bound.

This log records gaps and decisions only. It does not authorize provider use, workflow dispatch, PR merge, G3, Pilot, confirmatory execution, scoring, or benchmark acceptance.

## 2026-08-05 — C018-C021 control-plane catch-up

- PR `#89` merged exact head/tree `e162c71f47c11bb9eb745f6eb463cd9652e2c615` / `1d6c723f22bcf92d37e16fdb23277d86ef35a762` after independent `ACCEPT` and OWNER approval. P1.4 is `PASS`; weighted completion is `33%`.
- PR `#81` merged repair-6 as `4e1347e510a0068efbdff6942748671490c798ea`; this resolves the repair-6 approval-source conflict but does not establish G2 success.
- Delegation V1 authorized exactly one Runtime Identity dispatch; run `31014045209` failed `CANARY_UPSTREAM_NON_2XX`. Provider-request consumption is `INDETERMINATE`, and the run is forbidden from rerun.
- PR `#95` merged privacy-safe diagnostics as `9c83280cec2d9f8fedd15455cfa261680452969f`. Draft PR `#96` prepares inactive V2 at head/tree `9bd3371147726b5274ea6ad528f0ca4a35b017ec` / `6b8e8252e012ac10857188f13be76de6cf3e0079`, manifest SHA-256 `1dfc6a73651030fd75658e61df3e022c8354976e36803a03f8165c2af287c29f`.
- Decision: keep the stale top-level G2 record as `EVIDENCE_CONFLICT`, select P3.1, and stop at `AUTONOMOUS_COMPLETION_DELEGATION_MANIFEST_V2_ACTIVATION`. No dispatch occurred after run `31014045209`.
