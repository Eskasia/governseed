# External OSS Benchmark V5 report

Status: SEED_IDENTITY_REPAIRED_STATIC_READY

Evidence class: external-observational

## Result

PR #46 is merged at 167a0f67aa55ce0d66eee31afca2a45a056b1a26. The V4
dependency-cache attempt-1 failure remains present and is referenced by
content hash; no V4 evidence was edited.

All three retained task identities now have exact upstream parent and fix
commit identities, deterministic local sealed-seed commits, explicit Git
trees, and an executable canonical tracked-file hash. Two independent
reconstructions agree for all three tasks. The Immich Git tree equals the
legacy V3 sealed tree after the reviewed three-path overlay. The old Immich
tracked-file hash is not claimed as reproduced because the V3 symlink
encoding was unspecified.

The hidden-oracle red/green checks are revalidated for all three tasks:
parent FAIL_EXPECTED and fix PASS. Oracle source remains outside the agent
workspace.

The V5 dependency-cache workflow is statically validated and contains no
sealed-seed fetch, default-branch fallback, push, credential reference,
Codex invocation, or hidden-oracle invocation. It was not dispatched.

## Not run

- V5 dependency-cache preparation or offline cache verification.
- Local Docker daemon measurement (EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE applies to the unrun measured container path).
- Codex/provider execution.
- Pilot, confirmatory runs, blind scoring, bootstrap statistics, or promotion decision.

## Decision boundary

V5 is eligible for the next infrastructure-gated dependency-cache
qualification phase only after the blockers in blockers.json are resolved.
This report does not support a claim that GovernSeed improves agent
correctness, safety, efficiency, or external-project outcomes.
