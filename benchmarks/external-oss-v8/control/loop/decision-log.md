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
- GitHub comment <https://github.com/Eskasia/governseed/issues/84#issuecomment-5185865928> is an `OWNER` comment by `Eskasia`, created and last updated at `2026-08-04T23:48:25Z`; its body SHA-256 is `0aca84e3a9468235cb1a96ab14e200d8f3dd4cc1540c4f61e9e0c1f151e588c3`.
- The comment authorizes contract implementation and review only, binds main `12f1802173c05e880139a2841900e6953d16d42d`, and conditions R1 adoption of V4 task identities on revalidation of their committed hashes.
- The declared scorer hashes match current main exactly: schema `90fd773ccad80fafc23d6b51a003821efa04a08f9a441639a3a0b4af3a63c955` and implementation `cf5789192f6630dc7686c6c393a28eff5b23f896a3658ca626a6cb6296fd9daa`.
- TASK-OSS-03 and TASK-OSS-09 match across V4 and V5 for repository, legacy seed identity, public test, path policy, hidden-oracle identity, and parent-red/fix-green evidence.
- TASK-OSS-01 matches those fields except seed-tree reproduction: V4 binds seed commit `0ad23a4f16331512f49c570acc2e9ff8093c8248` and tree SHA-256 `88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa`, while committed V5 evidence records `legacyV3SeedTreeHashReproduced=false` and reconstructs seed `15ba6bed78feebe392dfbe13cf0be4065b260af7` with tree SHA-256 `3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e`.
- No GitHub Actions run was created at or after the decision timestamp; no provider-consuming workflow was dispatched.
- Decision: do not implement R1 with an unverified V4 seed and do not silently substitute the V5 seed, because the owner comment says a task-identity change creates R2. Require either reproducible evidence for the V4 TASK-OSS-01 seed tree or an owner-approved new revision bound to the V5 identity.

## Claim boundary

This log records gaps and decisions only. It does not authorize provider use, workflow dispatch, PR merge, G3, Pilot, confirmatory execution, scoring, or benchmark acceptance.
