# V8 G2 credential transport design

Benchmark: `GS-OSS-2026-08-02-V8`
Evidence class: `external-observational`
Decision: `HARD_BLOCKED`

## Intended boundary

The only candidate is a host-side narrow credential proxy. A measured
container would have no provider credential, no GitHub token, and no general
network. It would reach one run-scoped Unix-domain socket at
`/run/governance/proxy.sock`; the host process would inject the provider
authorization header and would retain the provider key only in host memory.

The proposed fixed route is `POST https://api.openai.com/v1/responses`. The
request and response contracts are the two adjacent JSON Schema files. The
client header allowlist is only `content-type`; `accept`, `authorization`, and
`content-type` are reconstructed by the host proxy. The proposed limits are
1 MiB request, 4 MiB response, 30 seconds, one request per canary run, and
8,192 total tokens.

The socket must be mode `0600`, single-use, bound to the benchmark ID, run ID,
and task ID, and removed with a proof after client disconnect, timeout, proxy
crash, and normal completion. The container identity is proposed as
UID/GID `65532:65532`; the host owner UID/GID remains unobserved until a
reviewed Ubuntu runner canary. That missing observation is not filled with a
local macOS UID.

## Existing implementation review

The existing experimental proxy tests pass `125/125` with synthetic upstream
transport. This proves useful V4 offline behavior: a fixed request path and
method, bounded body sizes, host-side upstream-header reconstruction, sanitized
errors, and explicit socket close proofs.

It does not satisfy the V8 G2 contract as currently exposed:

| Required G2 property | Current observation | Disposition |
|---|---|---|
| No credential in measured container environment | `oci-proxy-facade.mjs` returns `OPENAI_API_KEY` and `OPENAI_BASE_URL` for container environment construction | `BLOCKED` |
| Fixed OpenAI endpoint | `credential-proxy.mjs` accepts any HTTPS host with `/v1/responses` | `BLOCKED` |
| Exact approved model | model is caller-supplied to the policy; no human approval binding | `BLOCKED` |
| Unknown header rejection | required headers are checked, but extra request headers are not rejected | `BLOCKED` |
| Unknown JSON field rejection | body validation checks selected fields but does not enforce closed top-level fields | `BLOCKED` |
| Benchmark/run/task binding | only an attempt ID is part of the existing contract | `BLOCKED` |
| Token ceiling and hashed receipts | no token ceiling, provider-request hash, request/response hash, or token-count receipt in the existing proxy | `BLOCKED` |
| Cleanup after all failure paths | normal close is proven; client-disconnect/timeout cleanup is not an automatic run cleanup proof | `BLOCKED` |

These findings are recorded in the G2 qualification matrix. They are not
fixed by adding a design document, and the V4 source/tests are outside the
G2 write scope. A later repair would need a new implementation commit, new
regression tests, a new Sol review, and a new human approval hash binding.

## Human approval boundary

No `human-approval.json` exists. A model ID, host socket owner UID/GID, exact
Codex binary, runtime image digest, runner identity, and network/containment
receipt therefore cannot be treated as locked. Luna and Sol cannot create or
sign that record. No provider request or runtime identity canary is permitted.

## Non-claims

This design does not establish provider access, Codex runtime identity, agent
compliance, coding quality, benchmark effectiveness, Pilot readiness, scoring,
or a formal benchmark lock.
