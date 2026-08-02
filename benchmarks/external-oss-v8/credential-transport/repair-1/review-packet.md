# GovernSeed V8 G2 credential transport repair-1

This packet records a fail-closed, host-side credential proxy repair. It is external-observational evidence only.

- Provider: OpenAI; `POST https://api.openai.com/v1/responses`.
- Limits: one request, 30,000 ms proxy deadline, 8,192 token ceiling, bounded request/response bytes.
- Container proxy variables: `GOVERNSEED_PROXY_SOCKET`, `GOVERNSEED_BENCHMARK_ID`, `GOVERNSEED_RUN_ID`, and `GOVERNSEED_TASK_ID`. Provider credentials are host-proxy scoped and are not passed through env, files, mounts, argv, or encoded values.
- Request and response contracts are closed by the repair schemas; model and benchmark/run/task identity are bound at proxy startup.
- The inherited packet has no measured exact model candidate. The proxy requires an exact non-alias model at startup, while synthetic tests use fixture-only model IDs.
- UDS tests cover normal completion, second client, identity mismatch, timeout, client disconnect/crash, proxy crash, cleanup, and socket identity.

Observed local result: 103/103 existing experimental tests and 10/10 repair UDS tests passed with zero provider requests. Docker was unavailable, so no container-runtime pass is claimed.

The independent Sol review is recorded under `benchmarks/external-oss-v8/control/G2/repair-1/`. Human approval remains exactly `PENDING_HUMAN_REVIEW`; G2 remains `BLOCKED`. This packet does not authorize provider access, runtime identity, G3, or Pilot.
