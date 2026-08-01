# GovernSeed External Benchmark V4

Benchmark ID: `GS-OSS-2026-08-01-V4`
Evidence class: `external-observational`

V4 is a harness-only qualification layer over the three V3 selected tasks. It does not re-search tasks, recreate hidden oracles, rerun V2 adoption, or start coding-agent runs. V2/V3 artifacts are inherited by hash and remain outside V4’s claim boundary.

The disposable measured-run target is a GitHub-hosted `ubuntu-24.04` runner. The preflight workflow only tests network, credential, filesystem, process, cgroup, resource, and read-only dependency-cache boundaries; it does not run Codex or a benchmark task.

`benchmark-lock.json` may be created only after a `READY` preflight receipt and complete runtime identity. Until then, V4 uses `benchmark-lock.draft.json` and `phase-4-gate.json` with fail-closed status.
