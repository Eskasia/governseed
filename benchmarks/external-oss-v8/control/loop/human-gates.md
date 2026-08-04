# Current human gates

## CONTROL_PR_REVIEW_AND_MERGE

- Status: `PENDING_EXTERNAL_FINAL_HEAD_BINDING_THEN_HUMAN_REVIEW_AND_MERGE`
- Issue: <https://github.com/Eskasia/governseed/issues/82>
- PR: <https://github.com/Eskasia/governseed/pull/83>
- Prior technical evidence head/tree: `c8d4979214e7a4e4e6ec7893a9aeec55844d3c03` / `31c1b8038e547cd3caf86ec6d5a02660e934aebe`; this is historical evidence for the next repair commit, not the final PR identity.
- Prior technical-head CI: run `30912675031`; its final conclusion must be read from GitHub and must not be inferred by this committed file.
- Final-head binding rule: because a commit cannot contain its own commit SHA, the exact final PR head/tree, fresh CI run, and independent verdicts must be recorded externally in a GitHub PR comment and repeated in the `HUMAN_GATE_PACKET`.
- Target: merge PR `#83` from `benchmark/p0-p0.4-loop-control` into `main`, but only after that external binding exists and names the then-current PR head/tree.
- Risk: merging makes this control plane canonical; stale or inaccurate state could misroute a provider-consuming gate.
- Authorized human action: review and merge only the exact final PR head identified in the final `HUMAN_GATE_PACKET`.
- Explicitly unauthorized: treating the branch as canonical before merge or using its completion percentage as a main-branch acceptance claim.
- Resume condition: PR `#83` is human-merged, main is fetched, and the merged commit/tree and Issue closure are reconciled.
- Claim boundary: orchestration metadata only.
