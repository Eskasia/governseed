# V7 source snapshot and read ledger

Benchmark: `GS-OSS-2026-08-02-V7`
Base commit: `0f4b844673af47d654a1e84ba5463ac21bd09cba`
Evidence class: `external-observational`

Files read before implementation:

- `/Users/william/.codex/attachments/4d947fb6-f579-4b45-aa92-2d56ea0d1248/pasted-text.txt`
- `AGENTS.md`
- `README.md`
- `VALIDATION.md`
- `startup/00-agent-start-here.md`
- `startup/01-bootstrap-gates.md`
- `startup/02-required-project-docs.md`
- `docs/governance-impact-eval.md`
- `docs/enforcement-boundary.md`
- `.github/workflows/external-oss-v6-dependency-cache.yml`
- `benchmarks/external-oss-v6/inherited-evidence.json`
- `benchmarks/external-oss-v6/permission-root-cause.json`
- `benchmarks/external-oss-v6/reproducer-result.json`
- V6 repair-4 local validation, implementation handoff, Luna handoff, and Sol verdict
- V6 run `30726888838` job `91440146062` log, including the Paperless `libmagic` failure
- V5 fixed task identity and dependency-cache contracts for TASK-OSS-01, TASK-OSS-03, and TASK-OSS-09

V6 failure source accounting is recorded in
`benchmarks/external-oss-v7/inherited-evidence.json`. The run failure file is
read from V6 evidence commit `3ff3273` and is not copied into or modified by
V7.

Runtime integration status at G0:

- Local Docker: `EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE`
- GitHub Actions runtime image build: `NOT_RUN_AT_G0`
- V7 dependency-cache qualification: `NOT_RUN`
- Sol G1 verdict: `NOT_RUN`
