# TASK-OSS-01 overlay review

Status: `REQUIRES_REVIEWED_OVERLAY`

The recorded V3 sealed commit is local-only and is not reachable from the
official repository. The exact upstream parent is reachable. Comparing the
parent tree with the recorded V3 sealed seed found only these deletions:

- `.vscode/settings.json`
- `design/.DS_Store`
- `e2e/test-assets` (the upstream gitlink)

These are seed-environment exclusions, not solution files. The overlay does
not touch any V3 fix path. `.gitmodules` is retained unchanged. Applying this
overlay to the upstream parent reconstructs Git tree
`88516884b2ff20092e8113d3ca73db404c657295`, which equals the recorded V3
sealed seed Git tree. Two independent reconstructions also produced the same
V5 sealed commit, tree, and explicit canonical tracked-file hash.

Overlay file SHA-256:
`21d58d72776c4812ace78d650e29c19e10f7ecfbc5a7434539e1b8c630351f94`

The legacy V3 tree hash `88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa`
is not reproduced under the explicit V5 symlink rule. This is recorded as a
migration limitation, not silently substituted with a passing value.
