# GovernSeed External OSS Benchmark V7

Benchmark ID: `GS-OSS-2026-08-02-V7`
Evidence class: `external-observational`

V7 is a new benchmark version. It inherits only the fixed V5 seed/task
identity and the recorded V6 failure evidence. It does not alter V2 through
V6, the task facts, the hidden oracle, public acceptance criteria, credentials,
or the formal benchmark lock.

The V7 G1 scope is runtime-image and dependency-cache qualification for:

- `TASK-OSS-01` — Immich
- `TASK-OSS-03` — Uptime Kuma
- `TASK-OSS-09` — Paperless-ngx

The measured job has no dynamic system-package installation. The Paperless
runtime image is built from the V6 Python base identity with the confirmed
missing `libmagic1` runtime package. Node tasks retain their V6 Node runtime
identity. Each task consumes the exact image archive and digest receipt
produced by the V7 image-build job.

G1 stops at `READY_FOR_G2` after three `READY` caches, three passing offline
smokes, three fail-closed negative cache tests, and an independent Sol
`ACCEPT`. It does not execute credentials, Codex, Pilot, scoring, or formal
lock work.
