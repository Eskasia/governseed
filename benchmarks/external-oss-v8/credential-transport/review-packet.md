# V8 G2 credential transport review packet

Benchmark ID: `GS-OSS-2026-08-02-V8`
Evidence class: `external-observational`
Status: `HARD_BLOCKED`

## Identity

- Design SHA-256: `f008088d354588319706156db7f06a01c87c0c85678b7b48441fdc3ea59e4395`
- Proxy source commit: `46e7a1a16c0b28614ed4e73147f93ffad2330e23`
- Proxy source SHA-256: `0a2102d972f00c5232b36c13ee1d5db388d6fe90b587055bd9fc739194bfbb06`
- Proxy facade SHA-256: `20cb9b2ddc3d99338c0f89626c73bd76cc382e159922e278e539b1f62326fed3`
- Proxy relay source: `experimental/governance-impact/uds-relay.mjs`

The existing synthetic/offline proxy suite is `125/125 PASS`. The added G2
suite is `31/31 PASS` as a finding-and-schema suite: 22 requested checks and
9 schema/approval/receipt/inheritance/packet checks. Thirteen of the 22 requested checks are
explicitly `BLOCKED` because the existing V4 interface does not satisfy the
G2 boundary.

## Proposed contract

| Field | Proposed value |
|---|---|
| Provider | OpenAI |
| Endpoint | `https://api.openai.com/v1/responses` |
| Method | `POST` |
| Request Schema | `request.schema.json`, SHA-256 `b78c2268ce8df35b88244aafeb58e56f4025732d102b8c010c3c08e81f322249` |
| Response Schema | `response.schema.json`, SHA-256 `40c068eadbc39a473ff91459adbf585db79b64a4e1e41cae7265b7086324a4b6` |
| Client headers | `content-type` only |
| Host-injected headers | `accept`, `authorization`, `content-type` |
| Request / response bytes | 1 MiB / 4 MiB |
| Timeout | 30 seconds |
| Request ceiling | 1 request per canary run |
| Token ceiling | 8,192 total tokens |
| Socket template | `${RUNNER_TEMP}/gs-oss-v8/${BENCHMARK_ID}/${RUN_ID}/${TASK_ID}/proxy.sock` |
| Container socket | `/run/governance/proxy.sock` |
| Container UID/GID | `65532:65532` |
| Socket mode | `0600` |
| Host socket UID/GID | pending reviewed Ubuntu runner observation |

The measured model must be the exact non-alias value in the human approval
record. It is intentionally unset here. `latest`, `Luna`, `Sol`, and any
runtime fallback are prohibited.

## Technical findings

The existing implementation has useful V4 evidence: fixed `POST` route shape,
bounded request/response bytes, host-side upstream authorization reconstruction,
sanitized error codes, and explicit normal-close socket proofs. It is not a
G2-qualified transport:

- `oci-proxy-facade.mjs` exposes a proxy bearer as `OPENAI_API_KEY` in the
  measured container environment.
- `credential-proxy.mjs` accepts any HTTPS host with `/v1/responses`, accepts a
  caller-selected model, and does not close the top-level JSON/header sets.
- The existing contract binds an attempt ID only; benchmark ID, run ID, and task
  ID are not enforced.
- The proposed one-request/30-second limits drift from the measured facade
  defaults: 32 requests and 300000ms.
- The core proxy does not pin or prove host socket UID/GID and mode, and the
  offline tests do not prove automatic cleanup for disconnect, timeout, or
  proxy crash.
- Token ceilings, request/response hashes, token counts, and provider request
  ID hashes are not part of the existing proxy receipt surface.
- The review input path for the relay is
  `experimental/governance-impact/uds-relay.mjs`; there is no
  `experimental/governance-impact/lib/uds-relay.mjs`.

These are recorded in `control/G2/credential-transport-findings.json`. The
G2 write boundary does not permit changing the V4 implementation in place.

## Human approval

`human-approval.json` is absent. No model ID, host socket owner, Codex binary,
runtime image, runner, or containment identity is therefore locked. Luna and
Sol cannot create, infer, or sign `approvedBy`. The required stop code is:

```text
CREDENTIAL_TRANSPORT_HUMAN_APPROVAL_REQUIRED
```

The independent read-only Sol review recommendation is `REJECT`. No provider
request, runtime identity workflow, canary, or Pilot may run from this packet.

## Prohibited claims

This packet does not establish provider access, credential approval, Codex
runtime identity, agent compliance, coding quality, Pilot readiness, scoring,
formal benchmark lock, or readiness for G3.
