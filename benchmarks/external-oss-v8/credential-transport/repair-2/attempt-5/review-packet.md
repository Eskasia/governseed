# GovernSeed V8 G2 repair-5 review packet

Benchmark `GS-OSS-2026-08-02-V8`, G2 repair-2 attempt-5, is pending human reapproval. The repair is limited to diagnostic provenance and failure-boundary repairs for the runtime identity canary. It does not authorize dispatch, provider execution, G3, Pilot, scoring, or benchmark acceptance.

## Exact bindings

- Provider: `OpenAI`
- Model: `gpt-5.6-luna`
- Alias allowed: `false`
- Fallback allowed: `false`
- Runtime image: `node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5`
- Node executable/version: `/usr/local/bin/node`, `v26.3.0`
- Upstream request limit: `1`
- Timeout: `30000 ms`
- Request structured output: `text.format`
- Fixed canary input: `Return exactly the JSON object {"runtime_canary":"PASS"}.`

## Repair boundary

The proxy now separates complete client requests, upstream attempts, upstream responses, and successful sanitized receipts. The upstream-attempt counter is incremented immediately before transport and is the request-limit counter. The proxy summary contains only safe counters, fixed stages/codes, socket acceptance, and cleanup status.

The canary client maps UDS and response failures to a fixed taxonomy and emits a fixed sanitized summary. It never emits a prompt, raw response, credential, authorization header, provider error text, or raw exception. The workflow sets an explicit stage before each failure-prone block and assembles schema-version-2 failure evidence without using receipt count as a provider-attempt claim.

## Preserved failed run

Run `30850478318`, job `91809002151`, artifact `8870415033`, and main commit `4b6caf996518682f57a5ff28e121bd38454d11e3` are preserved under `benchmarks/external-oss-v8/control/G2/runtime-canary-repair-5/run-30850478318/`. The source artifact ended with an under-specified `binding-validation / VALIDATION_IN_PROGRESS` label after the canary step began. The repaired record therefore uses `providerRequestAttempt=INDETERMINATE`, `approvedSingleRequestPossiblyConsumed=true`, and `successfulReceiptCount=0`; the run must not be rerun.

The source facts establish the locked image, Node path/version, observed non-secret environment names, container/socket identity, and socket mode. They do not establish UDS connection, upstream attempt, upstream response, provider model identity, provider response validity, or API-key use; those causes are intentionally not inferred.

## Approval and evidence boundary

Attempt-4 approval remains immutable and does not authorize this changed workflow, proxy, or canary client. The attempt-5 approval template and addendum are pending with `approvedBy=null`, `approvedAt=null`, and no approved attempt-5 record. Current preparation state is `providerRequests=0`, `workflowDispatch=NOT_RUN`, and `runtimeCanary=NOT_RUN`.

Required next gate: independent read-only Sol review of the committed attempt-5 tree, then human reapproval, merge to `main`, and only then a separately authorized runtime canary. A successful canary would still not establish G2, G3, Pilot, scoring, formal benchmark lock, or overall benchmark acceptance.
