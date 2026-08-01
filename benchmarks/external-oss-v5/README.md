# GovernSeed External OSS Benchmark V5

Benchmark ID: `GS-OSS-2026-08-01-V5`

Evidence class: `external-observational`

V5 repairs the V3/V4 seed identity contract for the three tasks retained for
dependency-cache qualification:

- `TASK-OSS-01` — `immich-app/immich`
- `TASK-OSS-03` — `louislam/uptime-kuma`
- `TASK-OSS-09` — `paperless-ngx/paperless-ngx`

## Seed identity contract

The public source of truth is the exact upstream base commit. The sealed seed
commit is a deterministic local reconstruction and is never fetched from the
upstream repository.

1. Fetch and verify `upstreamBaseCommit` from the repository URL in the task
   contract.
2. Materialize the upstream base tree without reading the fix commit, the
   original patch, or the hidden oracle.
3. Apply the reviewed overlay, when the contract names one.
4. Create exactly one local commit with the fixed V5 harness identity and no
   remote.
5. Verify the Git tree and the canonical tracked-file hash.

The canonical tracked-file hash is SHA-256 over a UTF-8, newline-terminated
manifest. Tracked paths are sorted bytewise. Each line is
`<value-sha256>  <relative-path>`. For regular files, the value is the SHA-256
of the file bytes. For symlinks, the value is the SHA-256 of the UTF-8 link
target returned by `readlink`. This rule is implemented by
`tests/seed-tree-hash.mjs`.

The legacy V3 Immich value `88c451...` is preserved as historical evidence,
but it is not claimed as reproduced because V3 did not publish an unambiguous
symlink encoding. The V5 contract uses the explicit hash produced by the rule
above. The reconstructed Immich Git tree is nevertheless byte-for-byte equal
to the V3 sealed seed Git tree.

## Evidence and execution boundary

PR #46 was merged before V5 and its V4 dependency-cache attempt-1 failure is
referenced by content hash in `inherited-evidence.json`. V4 remains blocked;
V5 does not inherit a READY runner or cache receipt.

The V5 workflow is static-ready only. It is intentionally not dispatched in
this phase. No dependency cache archive, offline container, Codex execution,
Pilot run, or confirmatory run is claimed. Credential transport remains
`BLOCKED` pending explicit human approval.

Use these local checks from the repository root:

```bash
node benchmarks/external-oss-v5/tests/seed-contract-validation.mjs
node benchmarks/external-oss-v5/tests/dependency-cache-workflow-validation.mjs
node benchmarks/external-oss-v5/tests/schema-validation.mjs
```

The hidden oracle source remains outside the agent workspace. V5 records only
its SHA-256 and the revalidated parent-red/fix-green exit outcomes.
