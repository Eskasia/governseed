# V8 G1 run 30735030613 failure analysis

Evidence class: `external-observational`.

The three inherited seed-identity, runtime-image, and dependency-cache jobs passed. All three workspace execution jobs then failed in the same step with exit code 1:

```text
/harness/v8-runtime-contract.sh: line 35: /workspace-mount.txt: Read-only file system
/harness/v8-runtime-contract.sh: line 35: /cache-mount.txt: Read-only file system
/harness/v8-runtime-contract.sh: line 35: /home-mount.txt: Read-only file system
/harness/v8-runtime-contract.sh: line 35: /tmp-mount.txt: Read-only file system
WORKSPACE_MOUNT_NOT_WRITABLE
```

Root cause: the runtime contract correctly used a read-only container root, but its `mount_options` observations were written to `/workspace-mount.txt`, `/cache-mount.txt`, `/home-mount.txt`, and `/tmp-mount.txt` at the root of the container. The observation files therefore failed before the actual mount flags or executable probes could run. This is a harness defect, not evidence that the explicit `/workspace:rw,exec` mount was ineffective.

Repair: write all four observation files under the writable `/workspace` tmpfs. Add a static regression test that requires those destinations and rejects the former root-level destinations.

No G1 acceptance is claimed. The offline positive smoke, negative cache test, and aggregate qualification were not run because the workspace execution prerequisite failed.

Preserved raw artifacts:

- `workspace-exec/external-oss-v8-workspace-exec-TASK-OSS-01/`
- `workspace-exec/external-oss-v8-workspace-exec-TASK-OSS-03/`
- `workspace-exec/external-oss-v8-workspace-exec-TASK-OSS-09/`

Each `container-output` file has SHA-256 `3dd693bc43524221600fc6a94e6c911542a734f10ca08aa4c351315e3d61bd75`.
