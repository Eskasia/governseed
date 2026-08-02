# V8 G1 run 30738110739 failure analysis

Evidence class: `external-observational`.

The inherited seed identity, runtime image, and dependency cache prerequisite matrices all passed 3/3. The fresh run then exposed two harness defects after the V8 mount-observation repair:

1. TASK-OSS-01 reached the runtime Vitest probe but failed with `SYMLINK_TARGET_EXECUTION_DENIED`. The runtime contract unconditionally called `readlink` on `./node_modules/.bin/vitest`; this cache provides a regular executable entry rather than a symlink. The contract had already resolved the path with `readlink -e`, but incorrectly treated a non-symlink `readlink` result as an execution failure.
2. TASK-OSS-03 and TASK-OSS-09 printed `PASS` from inside the container, but the host then failed `test -f "$out/workspace-exec-receipt.json"`. The workflow used `docker cp` to export files from `/workspace`, which is a tmpfs mount. The artifact contained only `container-id` and `container-output`, confirming that the tmpfs receipts were not exported. This is an evidence-export harness defect, not a failed in-container mount or binary probe.

The aggregate job `91470827450` executed and failed because the receipt directory was absent; offline smoke was skipped by its failed workspace prerequisite. Raw job logs and container outputs are preserved in this directory with SHA-256 bindings in `run.json`.

Repair cycle 2 changes the Vitest probe to record `REGULAR_FILE` when the resolved entry is not a symlink, while retaining symlink-chain capture for actual symlinks. It also adds a read-only harness wrapper that keeps successful containers alive until the host streams `/workspace` files through `docker exec`, then releases the container using a workspace sentinel. The workflow statically forbids the old `docker cp` tmpfs export path.

No G1 acceptance is claimed. The offline positive and negative smoke tests did not run.
