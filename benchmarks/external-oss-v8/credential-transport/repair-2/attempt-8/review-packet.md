# G2 diagnostic receipt persistence repair — attempt 8

Status: `PENDING_OWNER_REVIEW`

## Exact base and failure

- Base commit: `9c83280cec2d9f8fedd15455cfa261680452969f`
- Base tree: `f1f89f4dcb1d06cfd4e9af76df8fbaf7722cd64b`
- Failed run: `31032816504`, attempt `1`
- Failure artifact ID: `8941397535`
- Failure artifact digest: `sha256:6aec10269a8914befdb889c028b1e32d4ecfe204be282ae055f52367a6b04c85`
- Failure receipt comment: `5195468651`

## Repair boundary

The host proxy now keeps a bounded lifecycle watcher until a summary has been
persisted. When a request failure closes the credential proxy before a later
signal arrives, the watcher writes the already-sanitized summary exactly once.
The normal explicit `SIGTERM` and `SIGINT` shutdown path remains supported and
shares the same one-shot finalization guard.

The repair does not change the provider, endpoint, model, runtime image, fixed
input, timeout, token ceiling, request limit, fallback policy, task, seed,
oracle, scorer, metric, threshold, or experiment protocol.

## Privacy and authorization boundary

Only the closed diagnostic fields remain eligible for persistence. Raw provider
body, error message, prompt, response, headers, authorization data, credentials,
environment dumps, and secrets remain forbidden. This packet authorizes no
provider request, workflow dispatch or rerun, Environment approval, checker
replacement, merge, formal lock, Pilot, confirmatory execution, scoring,
benchmark acceptance, or final acceptance.
