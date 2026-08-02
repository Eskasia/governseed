# V8 G1 evidence review — run 30739570734

Evidence class: `external-observational`
Workflow: `.github/workflows/external-oss-v8-dependency-cache.yml`
Head: `38a19c8169ba16879b6fca1132f3bc0f5b6b3e85`
Run: <https://github.com/Eskasia/governseed/actions/runs/30739570734>

## Decision

`ACCEPTED` for G1 only. The aggregate receipt reports `READY`, and all three fixed tasks passed the required workspace and offline checks. This is a runtime/harness qualification result, not an AI coding-quality result.

## Required observations

| Gate | Result | Evidence |
|---|---:|---|
| Seed identity prerequisite | 3/3 PASS | `seed-TASK-OSS-*-job.log` |
| Runtime-image prerequisite | 3/3 PASS | `runtime-TASK-OSS-*-job.log` |
| Dependency-cache prerequisite | 3/3 PASS | `cache-TASK-OSS-*-job.log` |
| `/workspace` execution | 3/3 PASS | `workspace-TASK-OSS-*/workspace-exec-receipt.json` |
| `/workspace` mount | 3/3 PASS; `rw,exec` requested and no `noexec` observed | `workspace-TASK-OSS-*/workspace-mount.txt`, receipts |
| Root/cache/home/tmp boundary | 3/3 PASS | mount observations and receipts |
| Runtime binary probe | 3/3 PASS | workspace receipts and job logs |
| Offline positive smoke | 3/3 PASS | `offline-TASK-OSS-*/positive-output` and logs |
| Negative cache boundary | 3/3 PASS; `DEPENDENCY_CACHE_INCOMPLETE`, exit 42 | `offline-TASK-OSS-*/negative-output`, cache receipts |
| Aggregate qualification | PASS | `aggregate-artifact/v8-qualification.json` |

The task-specific checks also passed: Immich's Vitest smoke ran, Paperless-ngx's libmagic probes ran, and Uptime Kuma's targeted public smoke ran. The empty non-applicable Vitest fields for Uptime Kuma and Paperless-ngx are not used as a failure because the aggregate gate requires only the task-specific checks.

## Repair history and preserved failures

Run `30738733647` remains preserved as failed evidence: all three offline jobs stopped at the generated Bash parser with `syntax error: unexpected end of file`; no offline container test ran. The local reconstruction and static regression reproduce and prevent the bad heredoc indentation. Earlier V8 failures remain under the adjacent `run-30735030613/` and `run-30738110739/` directories.

## Boundary

No G2, Pilot, credentials, Codex/provider execution, formal lock, scoring, confirmatory run, or external-project mutation was performed. No causal claim about GovernSeed improving agent coding outcomes is supported by this run.
