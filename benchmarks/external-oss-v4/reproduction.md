# V4 reproduction

## Local checks

From the GovernSeed V4 repository root:

```bash
node benchmarks/external-oss-v4/tests/schema-validation.test.mjs
node benchmarks/external-oss-v4/tests/runner-workflow-validation.mjs
node --input-type=module < inherited-evidence hash checker
npm run check:experimental
npm run test:experimental
```

The first two commands validate V4 structure and workflow text. The inherited-evidence checker re-hashes all 34 V2/V3 manifest items. The experimental suite is an existing GovernSeed test surface and is not a V4 measured run.

## Disposable runner qualification

1. Dispatch `.github/workflows/external-oss-v4-runner-preflight.yml` manually from GitHub Actions on `ubuntu-24.04`.
2. Supply a reviewed digest-only OCI image identity and fixed resource inputs. Do not supply secrets; the workflow declares no secrets and no GitHub Environment.
3. Review the uploaded sanitized receipt and evidence. It must prove Docker `NetworkMode=none`, failed DNS/HTTPS/IPv4/IPv6 attempts, clean credential names, non-root/read-only/capability boundaries, read-only cache mount, stopped container, cgroup populated `0` or removed, no matching host PID, artifact privacy scan, and complete cleanup.
4. Run the V4 network-enabled dependency preparation job separately, then rerun the measured cache checks read-only. Any cache miss must emit `DEPENDENCY_CACHE_INCOMPLETE`; network fallback is forbidden.
5. Freeze exact Codex version/binary hash/model, OCI digest, receipt hash, resource limits, randomization seed, arm order, policy hashes, and cache hashes. Only then replace the draft with a schema-valid `benchmark-lock.json`.
6. Obtain independent security and human provider-credential approval before any future Pilot decision. Do not auto-start Codex or the 18 runs from this workflow.

## Current reproduction boundary

The local Docker client reported a missing daemon socket. No GitHub Actions dispatch or provider credential use was performed. The current `runner/preflight-receipt.json` is intentionally `BLOCKED`, and there is no V4 `benchmark-lock.json` or run record. `V3_HIDDEN_ORACLE_ROOT` is a logical alias resolved only by the local hash revalidation harness; no personal absolute path is committed.
