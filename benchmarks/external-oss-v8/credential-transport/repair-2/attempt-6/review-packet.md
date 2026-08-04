# GovernSeed V8 G2 runtime-canary repair-6

Benchmark `GS-OSS-2026-08-02-V8` is in `PENDING_HUMAN_REPAIR_6_REVIEW`.
Repair-6 fixes the binding-validation root cause from merged repair-5: the
workflow now validates the approved attempt-5 record and sanitized source
evidence instead of treating the approved record's existence as a pending
reapproval failure.

The activation gate is still closed. Each future run must use the
`governseed-v8-runtime` Environment, target `refs/heads/main`, provide the
exact `authorized_main_commit`, and have `github.run_attempt == 1`. The
authorization identity records `github.run_id`; reruns and commit mismatches
fail closed.

Attempt-5 approval/source, template, addendum, manifest, and review packet are
immutable inputs. The exact model remains `gpt-5.6-luna`, with no alias,
fallback, retry, arbitrary prompt, or second request. The runtime image is the
reviewed digest containing `/usr/local/bin/node` at `v26.3.0`; the fixed input
remains `Return exactly the JSON object {"runtime_canary":"PASS"}.`.

Historical runs `30814159615`, `30824406710`, and `30850478318` are permanently
marked `rerunPermitted=false`; repair-6 does not rerun them. Provider requests,
workflow dispatch, runtime canary, and runtime receipt remain `0`/`NOT_RUN`.

This packet is preparation for human repair-6 review only. It does not claim
provider success, runtime identity, G2, G3, Pilot, scoring, formal benchmark
lock, or benchmark acceptance.
