# GovernSeed External Benchmark V4

Benchmark ID: `GS-OSS-2026-08-01-V4`
Evidence class: `external-observational`

## Outcome

V4 repaired the benchmark harness artifacts and added a fail-closed GitHub Actions runner-preflight workflow. The preflight workflow was not dispatched in this environment, and the local Docker daemon was unavailable. Therefore V4 did not qualify a measured-run runner, did not create a valid Pilot lock, and did not start the 18-run Pilot.

The existing experimental GovernSeed credential proxy/OCI facade/UDS relay were syntax-checked and their test suite passed 125/125. That is implementation-contract evidence only; it is not a live Ubuntu runner receipt and does not authorize real provider credentials.

## V4 checks

- V2/V3 evidence: inherited with 34 byte hashes revalidated; no V2 or V3 files were modified.
- Pilot schema: PASS; the semantic test covers the required positive and negative repository/task/run-count cases.
- Confirmatory schema: PASS as a separate 8–10 repository shape; V4 Pilot does not use it.
- Workflow static validation: PASS; digest-only input, Ubuntu 24.04, `--network none`, non-root, read-only rootfs, dropped capabilities, no-new-privileges, finite PID limit, mount boundaries, credential denylist, cgroup/process checks, and cleanup checks are present.
- Runner preflight receipt: BLOCKED / NOT_RUN.
- Dependency cache preparation: BLOCKED / NOT_RUN for V4; V3 rehearsal cache manifests are inherited only.
- Pilot lock: draft only; no placeholder or invented runtime identity was used.

## Why the gate is blocked

The required `networkNoneObserved`, `credentialEnvironmentClean`, `workspaceBoundaryObserved`, `dependencyCacheReadOnly`, `processCleanupObserved`, `cgroupEmpty`, `artifactPrivacyScanPass`, and `cleanupComplete` observations can only come from the disposable Ubuntu workflow. None were observed locally. Exact Codex version, binary hash, model ID, OCI digest, randomization seed, arm order, and actual resource limits are also not frozen.

The credential design keeps the provider key host-side and limits the container to a narrow UDS protocol, but it remains blocked pending independent review and human approval. No real credential was read or transported.

## Decision

`REVISE_HARNESS` is not a V4 decision enum. V4 is a qualification gate, so the operational result is `BLOCKED: PILOT_LOCK_INCOMPLETE`; no treatment decision is made. The next allowed phase is a GitHub Actions preflight dispatch followed by independent receipt review. A valid `benchmark-lock.json` may only be created after that review; only then can a human-authorized operator decide whether to start the 18-run Pilot.
