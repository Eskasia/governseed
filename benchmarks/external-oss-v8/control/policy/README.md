# Candidate and Live Control-Plane Separation

This policy prevents a review candidate from changing merely because a checker,
approval, or merge event needs to be recorded. A candidate is one immutable
base/head/tree/CI tuple. Live control events are append-only GitHub Issue and PR
comments until a separately reviewed, batched control-only checkpoint updates
the repository ledger.

## Exact comment-body identity

The canonical digest is SHA-256 over `Buffer.from(apiResponse.body, 'utf8')`.
The verifier reads the raw GitHub API JSON and extracts `.body` in-process. Do
not pipe `gh api --jq .body` into a hash command: the CLI writes a record
separator newline that is not part of the API string.

Each event binds the API comment ID, URL, author, author association,
`created_at`, `updated_at`, and exact body digest. Editing is fail-closed:
`created_at` must equal `updated_at`. A new correction is a new comment.

## Append-only chain and tail

Every event after sequence 1 binds the prior event's sequence, comment ID, and
body digest. The latest event is the open tail and may remain unbound only until
the next event is appended. This avoids an impossible self-reference in which
a comment would need to contain its own not-yet-assigned ID and digest.

## Branch roles

- `candidate`: must remain at the frozen head/tree and must not add live loop
  state, approval, checker, human-gate, or reconciliation records.
- `control-checkpoint`: may update only the configured control-loop paths in a
  later batch. It must continue to bind the unchanged candidate head/tree.

This policy is control-plane integrity tooling. It does not authorize provider
requests, workflow dispatch, PR readiness, merge, formal lock, Pilot,
confirmatory execution, scoring, or benchmark acceptance.

## Verifier

```text
node scripts/verify-candidate-control-plane.mjs \
  --policy benchmarks/external-oss-v8/control/policy/candidate-control-plane-policy.json \
  --event event.json \
  --comment-json github-comment-api-response.json \
  --observed-head <sha> \
  --observed-tree <sha> \
  [--previous-event previous-event.json] \
  [--changed-paths changed-paths.txt] \
  [--branch-role candidate|control-checkpoint]
```

The command is offline. Capturing the GitHub API response is a separate,
read-only evidence step.
