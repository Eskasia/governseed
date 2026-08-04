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

## 2026-08-04 — Local UDS relay processes are inadmissible evidence

- A stale local `uds-relay.test.mjs` process tree from the repair-1 worktree has remained alive since 2026-08-02.
- It is not bound to a sanctioned G2 GitHub run or current main commit and therefore cannot satisfy any gate.
- Decision: classify it as local leaked test residue. Do not use it as runtime, cleanup, credential-isolation, or request-count evidence.

## Claim boundary

This log records gaps and decisions only. It does not authorize provider use, workflow dispatch, PR merge, G3, Pilot, confirmatory execution, scoring, or benchmark acceptance.
