# Current human gates

## CONTROL_PR_REVIEW_AND_MERGE

- Status: `PENDING_INDEPENDENT_RECHECK_THEN_HUMAN_REVIEW_AND_MERGE`
- Issue: <https://github.com/Eskasia/governseed/issues/82>
- PR: <https://github.com/Eskasia/governseed/pull/83>
- Exact reviewed technical head/tree: `c8cdfc3a608b3ff9b886ab516c3a29a67854b362` / `f639e1a3673007146c1417897ab8abe09fd963bc`
- Technical-head CI: run `30911942323`, Ubuntu/macOS/Windows `PASS`.
- Target: merge PR `#83` from `benchmark/p0-p0.4-loop-control` into `main`, but only after the repair commit has fresh CI and independent `ACCEPT` evidence bound to the then-current PR head/tree.
- Risk: merging makes this control plane canonical; stale or inaccurate state could misroute a provider-consuming gate.
- Authorized human action: review and merge only the exact final PR head identified in the final `HUMAN_GATE_PACKET`.
- Explicitly unauthorized: treating the branch as canonical before merge or using its completion percentage as a main-branch acceptance claim.
- Resume condition: PR `#83` is human-merged, main is fetched, and the merged commit/tree and Issue closure are reconciled.
- Claim boundary: orchestration metadata only.
