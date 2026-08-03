# GovernSeed V8 G2 repair-2 attempt-2 review packet

Status: `PENDING_HUMAN_REAPPROVAL`

Attempt-2 contains offline and synthetic repair evidence only. The exact measured candidate is `gpt-5.6-luna`; aliases and fallback models are forbidden. The fixed proxy-boundary input is `Return exactly the JSON object {"runtime_canary":"PASS"}.`.

The provider response contract is intentionally separate from the closed proxy-to-container normalized response. Provider validation requires a 2xx JSON Responses object with the exact model, completed status, null error and incomplete details, required output and usage values, and a total token count at most `8192`; documented provider and usage extensions are allowed. The container receives only `{model, output_text, usage}` and rejects additional fields. Raw provider response bytes are hashed for the redacted receipt and are not persisted.

| Artifact | SHA-256 |
| --- | --- |
| Design | `434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995` |
| Proxy source | `0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea` |
| Provider response validation contract | `5b36f410ebc898a34eb2d4e67814441c78d5331e1d0764750aeb98c9bfb7f528` |
| Provider response validation source | `980e8cef7e58028a017406b5ce776b292639bb756501cbbc002b01c4d2919711` |
| Request schema | `630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51` |
| Response schema | `5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e` |
| Normalized response schema | `5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e` |
| Canary client | `0fcbc59d2c77d5e42174eaff375d183016f1f361a338b4e77c2b9e73cc4a6742` |
| Workflow | `83bef779f31c271e40543fe40e9763f2a3321e69930f9c1ac4cd5fe5a6c02f26` |

The approved repair-1 record remains immutable and applies only to its original design and proxy hashes. No approved repair-2 record or runtime identity receipt is created. `approvedBy` and `approvedAt` remain `null` in `human-approval-repair-2.template.json`.

Provider requests: `0`. Workflow dispatch: `NOT_RUN`. Runtime canary: `NOT_RUN`. Human approval: `PENDING_HUMAN_REVIEW`.

Claim boundary: technical offline/synthetic repair evidence only; no provider access, credential use, runtime identity, runtime canary, task execution, G3, Pilot, scoring, formal benchmark lock, or benchmark acceptance is claimed.
