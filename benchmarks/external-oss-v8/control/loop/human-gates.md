# Current human gates

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
