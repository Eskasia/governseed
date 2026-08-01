Root cause: Docker `--mount` used unsupported bare `rw`/`ro` options.

Fix:
- workspace uses default writable bind mount
- cache and harness use explicit `readonly`
- `docker inspect` verifies effective mount modes
- static regression prevents bare `rw` from returning

Preserved:
- old failed run 30701085510 remains unchanged
- no schema, credential, task, benchmark threshold, or Pilot changes
- no Codex or provider execution

Claim boundary: harness correction only; external-observational.
