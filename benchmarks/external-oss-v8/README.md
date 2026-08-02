# GovernSeed External OSS Benchmark V8

Benchmark ID: `GS-OSS-2026-08-02-V8`
Evidence class: `external-observational`

V8 isolates the V7 `/workspace` mount-level `noexec` defect. It inherits only
the V7 measured artifact identities from run `30732978684`, rechecks their
SHA-256 values, and uses an explicit executable tmpfs for disposable
`/workspace` state.

The acceptance boundary requires mount observations from `findmnt`, a real
workspace shell execution probe, real task-runner probes, 3/3 offline smoke,
and 3/3 negative cache misses with `DEPENDENCY_CACHE_INCOMPLETE` and exit 42.

No cache archive, external clone, hidden oracle, credential, Codex/provider
execution, formal benchmark lock, Pilot, or scoring result belongs in V8.
