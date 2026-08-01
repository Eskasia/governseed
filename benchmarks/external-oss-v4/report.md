# GovernSeed External Benchmark V4

Benchmark ID: `GS-OSS-2026-08-01-V4`
Evidence class: `external-observational`

## Outcome

V4 repaired the benchmark harness artifacts and added a fail-closed GitHub Actions runner-preflight workflow. The workflow was published and dispatched as run `30701085510` on `main`, but failed before container creation because the workspace bind mount used invalid Docker long-form `--mount` syntax. Therefore V4 did not qualify a measured-run runner, did not create a valid Pilot lock, and did not start the 18-run Pilot.

The existing experimental GovernSeed credential proxy/OCI facade/UDS relay were syntax-checked and their test suite passed 125/125. That is implementation-contract evidence only; it is not a live Ubuntu runner receipt and does not authorize real provider credentials.

## V4 checks

- V2/V3 evidence: inherited with 34 byte hashes revalidated; no V2 or V3 files were modified.
- Pilot schema: PASS; the semantic test covers the required positive and negative repository/task/run-count cases.
- Confirmatory schema: PASS as a separate 8–10 repository shape; V4 Pilot does not use it.
- Workflow static validation: PASS; digest-only input, Ubuntu 24.04, `--network none`, non-root, read-only rootfs, dropped capabilities, no-new-privileges, finite PID limit, mount boundaries, credential denylist, cgroup/process checks, and cleanup checks are present.
- Runner preflight receipt: BLOCKED / workflow defect before container creation; host identity and digest partial evidence are preserved.
- Dependency cache preparation: BLOCKED / NOT_RUN for V4; V3 rehearsal cache manifests are inherited only.
- Pilot lock: draft only; no placeholder or invented runtime identity was used.

## Why the gate is blocked

The required `networkNoneObserved`, `credentialEnvironmentClean`, `workspaceBoundaryObserved`, `dependencyCacheReadOnly`, `processCleanupObserved`, `cgroupEmpty`, `artifactPrivacyScanPass`, and `cleanupComplete` observations require a successful disposable Ubuntu workflow. The exact run failed before those checks. Host identity, cgroup v2, resource capacity, and OCI digest were observed, but exact Codex version, binary hash, model ID, randomization seed, arm order, and measured cache identity remain unfrozen.

The credential design keeps the provider key host-side and limits the container to a narrow UDS protocol, but it remains blocked pending independent review and human approval. No real credential was read or transported.

## Decision

`REVISE_HARNESS` is not a V4 decision enum. V4 is a qualification gate, so the operational result is `BLOCKED: RUNNER_PREFLIGHT_FAILED`; no treatment decision is made. The failed run is not automatically rerun. A future harness fix must be reviewed and dispatched as a new run before any valid `benchmark-lock.json` can be created.
