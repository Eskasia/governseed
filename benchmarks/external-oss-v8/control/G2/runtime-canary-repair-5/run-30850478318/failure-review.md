# G2 runtime identity repair-5 failed-run review

The immutable source run is GitHub Actions run `30850478318`, job `91809002151`, on main commit `4b6caf996518682f57a5ff28e121bd38454d11e3`. Its failure artifact is preserved by artifact ID `8870415033` and was observed after the host proxy start block, at `Run one isolated provider-identity canary`.

The source artifact reported `failureStage=binding-validation`, `failureCode=VALIDATION_IN_PROGRESS`, and an empty failure-check list even though the canary block had started. Its receipt-derived request field cannot establish whether upstream transport began. This repair therefore records `providerRequestAttempt=INDETERMINATE`, `approvedSingleRequestPossiblyConsumed=true`, and `successfulReceiptCount=0`; the approved single request must not be reused.

The existing observations are retained as sanitized facts: the locked runtime image matched, Node was `/usr/local/bin/node` at `v26.3.0`, the observed container and socket identity was `1001:1001`, socket mode was `0600`, the four non-secret environment variable names were present, and no credential value, raw prompt, raw provider response, or provider error text is persisted here. UDS connection, upstream attempt, upstream response, and provider response details were not available in the existing artifact and are not inferred.

The normalized repair classification is `RUNTIME_FAILURE_DIAGNOSTIC_INSUFFICIENT`. The run is preserved and must not be rerun; a future canary requires a separately reviewed repair-5 workflow and a new human reapproval.
