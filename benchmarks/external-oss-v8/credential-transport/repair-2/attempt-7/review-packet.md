# G2 NON_2XX diagnostic repair — attempt 7

Status: `PENDING_OWNER_REVIEW`.

This repair preserves the failed run `31014045209` and its possibly consumed provider request. It does not rerun that workflow and does not authorize a provider request, workflow dispatch, Environment approval, merge, formal lock, Pilot, confirmatory execution, scoring, or acceptance.

The implementation records only HTTP status, closed provider error type/code tokens, request-observation state, and deterministic failure classification. Unknown provider strings become `UNRECOGNIZED`; raw bodies, error messages, prompts, responses, headers, authorization data, credentials, and environment dumps remain forbidden.

The provider, model, endpoint, task, fixed input, runtime image, request limit, timeout, token ceiling, no-fallback rule, and no-retry rule are unchanged.
