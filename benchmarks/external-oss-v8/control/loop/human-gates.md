# Current human gates

## PUBLIC_HIDDEN_SEPARATION_INDEPENDENT_REVIEW_AUTHORIZATION

- Status: `REPAIRED_CANDIDATE_EXTERNALLY_BOUND_PENDING_FRESH_REVIEW_AUTHORIZATION`; Issue <https://github.com/Eskasia/governseed/issues/88> and draft PR <https://github.com/Eskasia/governseed/pull/89> track P1.4.
- Prior checker: authorized read-only task `GS-EFFECT-R2-P1.4-INDEPENDENT-CHECKER` returned `REJECT` for exact head/tree `19a4405abdeb25c20a919897ec092e85dfcbf78f` / `0ce658e5bb35c84db4b7573d7193fe88366a67da`; sanitized receipt `pr-89-independent-review-rejection.json` records its one bounded hash-only metadata finding.
- Repair scope: remove hidden parent/fix result objects from the eight agent-visible task packages, close schema/tests around hash-only hidden-oracle identities, refresh dependent hashes, and retain PR `#87` reviewed-tree provenance for parent-red/fix-green evidence.
- Repair evidence: implementation head/tree `169e7ac947603e4b124fd113b89ca65f1feaea79` / `d1bd717e970dab3c7c11e433d0cd19248ee49b64`, three-platform CI run `30996735553`, technical comment `5190529563`, and Issue control comment `5190531656`.
- Review scope: P1.2 merge reconciliation, closed execution-agent-surface manifest/schema, Git-tracked public task/test accessibility, hidden-oracle hash-only metadata, negative mutations, evidence-index bindings, and C014-C017 loop controls.
- Required evidence before authorization: exact final draft-PR head/tree, successful Ubuntu/macOS/Windows validation, unchanged task/seed/oracle/scorer/runtime/workflow identities, and unchanged Runtime Identity workflow history.
- Authorized human action after repaired external binding: authorize exactly one fresh read-only checker for the exact repaired final head/tree; the consumed authorization does not carry forward.
- Explicitly unauthorized: editing, push, PR readiness, merge, another agent/provider request, workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring, or benchmark acceptance.
- Completion boundary: P1.4 remains non-PASS and weighted completion remains `31.0%` until a fresh checker accepts the exact final candidate and that exact head is separately owner-approved and merged.

## PUBLIC_HIDDEN_SEPARATION_PR_REVIEW_AND_MERGE

- Status: `BLOCKED_PENDING_ACCEPTED_INDEPENDENT_REVIEW`.
- Review scope: exact P1.4 draft-PR head/tree and the evidence listed above.
- Authorized human action only after an accepted checker verdict: approve PR readiness and merge for the exact reviewed head/tree.
- Explicitly unauthorized: provider request, provider-consuming workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring, benchmark acceptance, or approval of any later pushed head.
- Completion boundary: P1.4 remains non-PASS until the exact reviewed evidence is canonical on main.

## TASK_IDENTITY_INDEPENDENT_REVIEW_AUTHORIZATION

- Status: `SATISFIED` by accepted checker `GS-EFFECT-R2-INDEPENDENT-CHECKER-REPAIR-2` and sanitized comment <https://github.com/Eskasia/governseed/pull/87#issuecomment-5188871233>.
- Exact reviewed head/tree: `d5b1c32138496a91931b20f065c39f4404505d01` / `31dc203b0bb1af2d1546a9f9df676fa945dde792`.
- Claim boundary: independent review of P1.2 only; no authorization carries forward to P1.4 or any runtime/formal-lock/execution gate.

## TASK_IDENTITY_PR_REVIEW_AND_MERGE

- Status: `SATISFIED` by OWNER comment <https://github.com/Eskasia/governseed/pull/87#issuecomment-5189326581>; PR `#87` merged as `220c2d8d816194eb77da94e182258a0875202f3b` with exact reviewed tree `31dc203b0bb1af2d1546a9f9df676fa945dde792`.
- Main validation: run `30988393468`; Ubuntu/macOS/Windows `SUCCESS`.
- Claim boundary: canonical P1.2 task/oracle identity evidence only; no provider workflow, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring, or benchmark acceptance authorization.

## CONTRACT_PR_REVIEW_AND_MERGE

- Status: `SATISFIED` by owner comment `5187112324`; PR `#85` merged as `b812fe7e9096beee4ae8310482055648ad022d4a` with exact reviewed tree `e2c4dcafdcd8f5f5e2962031979039ce70432615`.
- Draft PR: <https://github.com/Eskasia/governseed/pull/85>
- Decision sources: <https://github.com/Eskasia/governseed/issues/84#issuecomment-5185865928> and <https://github.com/Eskasia/governseed/issues/84#issuecomment-5186392861>.
- Exact review scope: R2 contract artifacts under `benchmarks/external-oss-effectiveness-r2/`, resolution reconciliation record, C009 control-state transition, and associated offline tests.
- Required review decision: approve or reject the exact final PR head/tree after CI and independent read-only review. Approval may authorize PR readiness and merge only; it must not authorize provider requests, workflow dispatch, G2/G3, formal lock, Pilot, confirmatory execution, scoring, or benchmark acceptance.
- Remaining fail-closed inputs: eight confirmatory task identities/oracles, runtime/formal-lock bindings, immutable overlay hashes, and price snapshot are not supplied by this gate.
- Claim boundary: contract implementation evidence only; no runtime, effectiveness, scoring, or acceptance claim.

Issue `#86` authorizes offline/public-repository task and hidden-oracle preparation only. PR `#87` is now the current P1.2 review gate. The separate READY `G2_REPAIR6_TECHNICAL_REVIEW_AND_MERGE` gate for PR `#81` remains queued and is not authorized by the PR `#85` approval.

The prior `EXPERIMENT_CONTRACT_TASK_IDENTITY_RESOLUTION` gate was satisfied by owner comment `5186392861`; the historical conflict and resolution remain preserved below.

## EXPERIMENT_CONTRACT_TASK_IDENTITY_RESOLUTION

- Status: `BLOCKED_TASK_OSS_01_V4_SEED_HASH_REVALIDATION_FAILED`
- Current main SHA/tree: `12f1802173c05e880139a2841900e6953d16d42d` / `2eee3c5237d3ef7cda947e3cb843eddd50668f69`
- Issue: <https://github.com/Eskasia/governseed/issues/84>
- Owner decision: <https://github.com/Eskasia/governseed/issues/84#issuecomment-5185865928>; comment ID `5185865928`, `OWNER` author `Eskasia`, created at `2026-08-04T23:48:25Z`, exact UTF-8 API-body SHA-256 `12263c44592a5e7a038e51ede76beeccc637ea4904681b3a03817a66b386a3f5` (the previously reported `0aca84e3a9468235cb1a96ab14e200d8f3dd4cc1540c4f61e9e0c1f151e588c3` includes a CLI-added trailing LF and is non-canonical).
- Draft control PR: <https://github.com/Eskasia/governseed/pull/85>; it remains draft and is not authorized for ready or merge.
- Exact conflict: R1 conditionally adopts the V4 TASK-OSS-01 seed commit `0ad23a4f16331512f49c570acc2e9ff8093c8248` and seed-tree SHA-256 `88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa`, but committed V5 evidence records `legacyV3SeedTreeHashReproduced=false` and instead reconstructs commit `15ba6bed78feebe392dfbe13cf0be4065b260af7` with tree SHA-256 `3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e`.
- Evidence summary: scorer hashes match `2/2`; TASK-OSS-03 and TASK-OSS-09 identities reconcile; TASK-OSS-01 public test, path policy, hidden-oracle identity, and parent-red/fix-green evidence reconcile, but its V4 seed tree does not reproduce.
- Risk: using the V4 seed would violate the comment's revalidation condition; substituting the V5 seed would change a task identity and therefore require R2 under the same decision.
- Authorized human action: choose exactly one resolution below and post it as a repository-owner comment on Issue `#84`.
- Explicitly unauthorized: contract implementation, PR readiness, merge, provider requests, workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring execution, or benchmark acceptance.
- Expected GitHub evidence: an owner-associated comment with immutable `created_at`, one exact revision/seed choice, exact commit and tree SHA-256, and implementation-only scope.
- Resume condition: fetch Issue `#84`; verify a new owner comment selects one exact resolution and predates every contract-implementation commit; then implement that revision without changing any other decision field.
- Claim boundary: pre-implementation identity reconciliation only; no R1/R2 contract, runtime, effectiveness, scoring, or acceptance claim.

Paste-ready resolution A — retain R1 only after new reproduction evidence exists:

```text
APPROVE EXPERIMENT_CONTRACT_TASK_IDENTITY_RESOLUTION for Issue #84. Retain experiment GS-OSS-2026-08-05-EFFECT-R1 and TASK-OSS-01 V4 seed commit 0ad23a4f16331512f49c570acc2e9ff8093c8248 with seed-tree SHA-256 88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa. The reviewed reproduction evidence is <immutable evidence path, commit, and SHA-256> and proves that exact seed tree. This approval authorizes contract implementation and review only; it does not authorize provider requests, workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring execution, PR readiness, merge, or benchmark acceptance.
```

Paste-ready resolution B — create R2 using the committed V5 reconstruction:

```text
APPROVE EXPERIMENT_CONTRACT_TASK_IDENTITY_RESOLUTION for Issue #84. Supersede GS-OSS-2026-08-05-EFFECT-R1 before execution and create GS-OSS-2026-08-05-EFFECT-R2. Bind TASK-OSS-01 to V5 reconstructed sealed seed commit 15ba6bed78feebe392dfbe13cf0be4065b260af7 and seed-tree SHA-256 3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e. Preserve every other field from owner comment 5185865928 unchanged. R1 and R2 evidence must never be pooled. This approval authorizes R2 contract implementation and review only; it does not authorize provider requests, workflow dispatch, G2/G3 execution, formal lock, Pilot, confirmatory execution, scoring execution, PR readiness, merge, or benchmark acceptance.
```
