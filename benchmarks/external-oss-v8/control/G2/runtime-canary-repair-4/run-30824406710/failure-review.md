# G2 runtime identity repair-4 failed-run review

The immutable source run is GitHub Actions run `30824406710`, job `91722204763`, on main commit `00cd4d80a550bbae150248c52b4ff5faf68ac351`. It failed during binding validation with `REPAIRED_BINDING_INVALID`.

The failure was caused by the squash-merge provenance rule: the workflow required the approved PR technical head `e043ae4af346d0db63b3edf163bf5ac7c7ccb31a` to be a Git ancestor of the squash-merged main commit. The technical tree bytes were present in main, but the PR commit object was not an ancestor after squash merge. This is recorded as `SQUASH_MERGE_ANCESTRY_VALIDATION_DEFECT`, not as technical drift, provider failure, model failure, or runtime failure.

Provider request count was `0`; the host proxy was `NOT_STARTED`; the runtime canary and Node path probe were `NOT_RUN`. The run was not re-executed. No API key, credential value, prompt, provider response, or raw exception stack is persisted in this evidence directory.
