# V4 dependency-cache preparation design

Status: `BLOCKED_PREPARATION_JOB_NOT_RUN`
Evidence class: `external-observational`

This document defines the preparation boundary required before a V4 measured
preflight. It does not create a cache, install dependencies, execute a task,
or expose a hidden oracle. The three source lockfiles and their hashes are
inherited from V3 in `dependency-cache-manifest.json`; they are not measured
cache identities.

## Preparation job

The preparation job must run on a disposable, network-enabled Ubuntu runner
with no Codex, provider credential, task prompt, hidden oracle, or benchmark
agent. It must use the sealed V3 parent seeds and exact dependency lockfiles
for `TASK-OSS-01`, `TASK-OSS-03`, and `TASK-OSS-09`. For each task it must:

1. Resolve only the dependency files declared by that task's public project
   configuration and lockfile.
2. Record the runner image identity, package-manager version, lockfile SHA-256,
   resolved package/artifact names, versions, and SHA-256 values.
3. Store the resulting cache under a content-addressed directory and emit a
   manifest whose SHA-256 is calculated after all files are closed.
4. Upload only the cache archive, manifest, and sanitized tool/version logs.

The preparation job must fail closed on an undeclared dependency, missing
checksum, lockfile drift, failed resolution, private registry request, or
post-build cache mutation. It must never fall back to the network during a
measured run.

## Measured-run consumption

The measured runner must download the exact preparation artifact, verify its
archive and manifest hashes, mount the cache read-only, and record the verified
cache identity in the run receipt. A cache miss, hash mismatch, or incomplete
manifest is `DEPENDENCY_CACHE_INCOMPLETE`; it is not a reason to install or
retry from the network. The measured container remains `--network none`.

The current V4 state is `NOT_RUN`: no preparation artifact, cache archive,
measured cache SHA-256, or receipt exists. Accordingly
`benchmark-lock.draft.json` intentionally omits `dependencyCacheSha256` and a
valid `benchmark-lock.json` is not permitted.
