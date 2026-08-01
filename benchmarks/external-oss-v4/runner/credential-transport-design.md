# V4 credential transport design

Status: `BLOCKED` for Pilot approval. No real provider credential is used in V4, and no provider endpoint is called.

## Decision table

| Scheme | V4 disposition | Reason |
|---|---|---|
| API key directly in the container | FORBIDDEN | Violates credential-free container boundary and makes artifact/environment leakage harder to prove. |
| API key written into the workspace | FORBIDDEN | The task workspace must remain free of provider credentials. |
| API key written to a read-only mounted file | FORBIDDEN | Read-only does not remove credential disclosure or reuse risk. |
| Host-side narrow credential proxy | ONLY ACCEPTABLE CANDIDATE | Keeps provider credential host-side and can expose one fixed, bounded request protocol over a Unix-domain socket. |
| GitHub token passed into the container | FORBIDDEN | GitHub automation identity is not a provider credential and must not be inherited by the measured container. |

## Proposed narrow proxy contract

The host owns the provider credential and starts one per-run proxy only after the run lock and reviewed identity are verified. The container has no provider credential and `NetworkMode=none`. The only permitted transport is a per-run Unix-domain socket exposed through a deliberately reviewed relay boundary.

The proxy must:

- accept only `POST /v1/responses`;
- pin one model, one upstream HTTPS endpoint, one attempt ID, one request schema, and one request/response byte limit;
- reject arbitrary URLs, arbitrary headers, remote input URLs, server-side state, server-executed tools, and background requests;
- cap requests, concurrency, and deadline;
- sanitize all errors, logs, public handles, and artifacts so request bodies, bearer values, upstream keys, and full prompts/responses never appear;
- fail closed when the socket, policy hash, proxy, relay, or cleanup proof is unavailable;
- remove and prove absence of the socket, proxy process, relay process, and temporary state after the run.

## Existing GovernSeed experimental interface review

The existing `experimental/governance-impact/lib/credential-proxy.mjs`, `oci-proxy-facade.mjs`, and `uds-relay.mjs` were syntax-checked and their experimental test suite passed 125/125. The implementation already has fixed route/policy, quotas, sanitized failure, host-side key access, UDS relay, and cleanup-proof tests. This is reusable design evidence, not a V4 production approval: V4 still requires a disposable Ubuntu runner receipt, reviewed digest/model/binary identity, human approval for any future real credential, and an explicit proof that the chosen relay attachment satisfies the container’s network boundary.

## Fail-closed approval rule

`credentialTransportDesign` may become `APPROVED_FOR_PILOT` only after an independent security review confirms the exact proxy/relay invocation, the runner receipt is `READY`, and the human reviewer approves the provider/model identity. Until then `phase-4-gate.json` must keep `pilotAllowed=false`.
