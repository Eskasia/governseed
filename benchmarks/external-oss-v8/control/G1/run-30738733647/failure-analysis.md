# V8 G1 run 30738733647 failure analysis

Evidence class: `external-observational`.

The inherited seed identity, runtime image, and dependency cache prerequisite matrices passed 3/3. The workspace execution matrix also passed 3/3, including the executable `/workspace` probe and runtime binary probes.

All three offline jobs failed before starting an offline container. The raw GitHub Actions logs show the same generated-script error:

```text
syntax error: unexpected end of file
```

The offline workflow contained a nested Node heredoc whose `NODE` delimiter was indented two spaces beyond the YAML `run: |` block baseline. GitHub Actions preserved that relative indentation when generating Bash, so Bash did not recognize the delimiter and reported an unterminated heredoc at EOF. This is a benchmark harness defect, not a cache, task, runtime-image, or GovernSeed product result.

The aggregate job failed because no offline receipts existed. Negative-cache tests therefore did not run. The three workspace PASS receipts, all four failed-job logs, container outputs, and hashes are preserved in this directory.

Repair cycle 3 dedents the delimiter to the workflow block baseline and adds a static regression that rejects any `NODE` delimiter with non-baseline indentation. A local reconstruction of the exact offline `run: |` block passes `bash -n` after this repair.

No G1 acceptance is claimed. Offline smoke and negative cache acceptance remain `NOT_RUN` for this run.
