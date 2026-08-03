# GovernSeed V8 G2 repair-2 attempt-4 review packet

- Benchmark: `GS-OSS-2026-08-02-V8`
- Branch: `benchmark/v8-g2-runtime-canary-repair-4`
- Status: `PENDING_HUMAN_REAPPROVAL`
- Technical head: `19e0b086dc31e31a308fc3a2d39bc5cf4e78b8c0`
- Technical tree: `6b586424d3d6d9560c7d3fe915079203e7fa1175`
- Review packet SHA-256: `7de8be5700ee46df77cdd68fa670b06c0f8990033acd58c0f69c6ca4dfd553d6`
- Technical manifest SHA-256: `c4610bb68f5ddec2b143cf174ce1defcebe57f36a57c78e5372b21f1b3b30a6e`
- Workflow SHA-256: `33adf28248f6762bfd64decd1f7a2b6899d6dd3f206d07b70dcbd88d929ba6f1`

## Binding

The measured provider candidate is exactly `OpenAI / gpt-5.6-luna`. Aliases and fallback models are forbidden. The fixed canary input, Responses `text.format` contract, one-request limit, `30000` ms timeout, exact Node executable `/usr/local/bin/node`, and pinned runtime image are unchanged from the reviewed transport contract.

The runtime validates the exact sorted technical manifest and current file hashes. It checks the current main parent ancestry only; it does not require the reviewed technical commit to be an ancestor of a squash-merged main commit. `reviewedTechnicalHead` and `reviewedTreeSha` remain offline review metadata in the pending addendum.

Inherited transport hashes remain:

- Design: `434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995`
- Proxy: `0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea`
- Request schema: `630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51`
- Response schema: `5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e`
- Provider response contract: `5b36f410ebc898a34eb2d4e67814441c78d5331e1d0764750aeb98c9bfb7f528`
- Normalized response schema: `5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e`

## Preserved failure

Run `30824406710` / job `91722204763` is preserved as external-observational evidence. It failed at binding validation with `SQUASH_MERGE_ANCESTRY_VALIDATION_DEFECT`; provider requests were `0`, host proxy was `NOT_STARTED`, runtime canary was `NOT_RUN`, and no credential or raw exception was persisted. The repair removes that ancestry dependency without rerunning the failed workflow.

## Verification

The local gates and focused tests passed:

- `npm run check`, `npm run validate`, `npm run test:governance`, `npm run test:privacy`, `npm run test:experimental`, and `npm run ci`: PASS
- Current G2 focused suite: `69 passed, 0 failed`
- Repair-4 regression suite: `32 passed, 0 failed`
- Experimental proxy/provider-response/normalized-response/UDS suites: `122 passed, 0 failed`
- YAML parse, shell syntax, Node syntax, secret scan, and hash consistency: PASS

No provider request, Models API request, workflow dispatch, runtime canary, G3, Pilot, scoring, formal benchmark lock, or benchmark acceptance is claimed. No attempt-4 approved record or runtime identity receipt exists.
