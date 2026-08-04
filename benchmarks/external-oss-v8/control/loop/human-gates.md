# Current human gates

## CONTROL_PR_REVIEW_AND_MERGE

- Status: `PENDING_PR_CREATION`
- Issue: <https://github.com/Eskasia/governseed/issues/82>
- Target branch: `benchmark/p0-p0.4-loop-control`
- Human action eventually required: review and merge the exact independently accepted control-plane PR head.
- Explicitly unauthorized: treating the branch as canonical before merge or using its completion percentage as a main-branch acceptance claim.
- Resume condition: the PR exists with final commit/tree, fresh CI evidence, and an independent checker verdict.
- Claim boundary: orchestration metadata only.
