# V8 G2 gate report

- Current state: `HARD_BLOCKED`
- Benchmark ID: `GS-OSS-2026-08-02-V8`
- G1 status: `ACCEPTED`; inherited evidence revalidated `31/31`, immutable G1 evidence unchanged
- Execution model: primary fallback; exact deployed model identifier is not exposed by tool context
- Sol model: `gpt-5.6-sol` (`ultra`), independent read-only review
- Proxy tests: `125/125 PASS`
- G2 tests: `31/31 PASS` after schema and packet checks; 22 proxy checks are `9 PASS / 13 BLOCKED`
- Review packet: `credential-transport/review-packet.json` and `.md`
- Design SHA-256: `f008088d354588319706156db7f06a01c87c0c85678b7b48441fdc3ea59e4395`
- Proxy SHA-256: `0a2102d972f00c5232b36c13ee1d5db388d6fe90b587055bd9fc739194bfbb06`
- Human approval: absent; stop code `CREDENTIAL_TRANSPORT_HUMAN_APPROVAL_REQUIRED`
- Approved identity/model: not applicable
- Codex version/binary SHA/package identity: not captured
- Measured model ID: not captured
- Runtime workflow/run: not created / not run
- Canary: not run
- Container credential: existing facade exposes `OPENAI_API_KEY`; G2 requirement blocked
- Network isolation: not observed for a runtime canary
- Proxy cleanup/process cleanup: not proven for crash, disconnect, and timeout in the G2 runtime boundary
- Runtime identity receipt: not created
- G2 verdict: Sol `REJECT`; gate `HARD_BLOCKED`

## PASS

- G1 inherited hashes match and G1 evidence was not modified.
- Existing offline proxy suite passes `125/125`.
- G2 evidence/schema tests pass without provider or task data.
- No provider request, credential value, runtime canary, Pilot, scoring, or formal lock was created.

## FAIL

- The existing measured container environment contains a proxy bearer under `OPENAI_API_KEY`.
- Endpoint, model, header, unknown-field, benchmark/run/task binding, socket identity, and runtime cleanup requirements are not fully implemented.
- Measured facade defaults drift to 32 requests and 300000ms versus the proposed 1 request and 30000ms.

## HARD_BLOCKED

- No valid human approval record exists.
- Sol independently returned `REJECT`.

Next allowed phase: repair the G2 transport contract, update the packet, obtain a new independent Sol review, then obtain a valid non-model human approval. This report does not authorize G3.
