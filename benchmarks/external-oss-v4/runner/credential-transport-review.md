# V4 credential transport review packet

Evidence class: `external-observational`
Approval status: `PENDING_HUMAN_REVIEW`

## Reviewed inputs

- Design SHA-256: `a25f712b5c157bb9a4007c27b38e669b121553e31d8dba7c32b04be232f10577`
- GovernSeed source/test commit: `154e6038d69c1048f0f912ef32520df487e7a8b8`
- Existing experimental proxy result: `npm run test:experimental`, 125/125 PASS.
- V4 runner receipt: `BLOCKED`; no live Ubuntu observation is substituted.

## Boundary checklist

- Provider credential in container: forbidden; no real credential was used.
- General container network: disabled by `NetworkMode=none`; live observation is pending.
- Unix-domain socket: container-visible target is `/run/governance/proxy.sock`; the host-side facade uses a per-run private `core.sock` under managed temporary state and mode `0600` in the reviewed implementation. Runtime owner and namespace attachment remain unobserved until the disposable runner is qualified.
- Ownership: container process is fixed to UID/GID `65532:65532`; host-side proxy ownership must be the disposable runner service account and must be recorded by the live receipt.
- Provider endpoint: one fixed HTTPS route, surfaced as `POST /v1/responses`; arbitrary URLs are rejected.
- Model: one reviewed fixed model value per run; exact model identity is not frozen in V4.
- Request/response limits: 1 MiB request, 4 MiB response, 32 requests, and a bounded per-attempt deadline in the existing facade policy.
- Header policy: reconstructed allowlist only; client identifiers and arbitrary headers do not cross the boundary.
- Timeout and failure: deadline, byte quota, concurrency, transport, policy, and cleanup failures fail closed.
- Cleanup: socket, proxy, relay, and temporary state must be removed and proven absent; the live cleanup receipt is pending.
- Prompt/output retention: implementation tests require sanitized errors/logs/public handles and no full prompt or output persistence; independent review remains pending.

## Approval fields

```text
approvalStatus: PENDING_HUMAN_REVIEW
approvedBy: null
approvedAt: null
```

Codex does not approve this transport. Approval requires an independent security
review of the exact relay invocation and a human decision on the provider and
model identity. Until then `credentialTransportDesign` remains `BLOCKED` and
`pilotAllowed` remains `false`.
