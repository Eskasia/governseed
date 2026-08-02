# GovernSeed V8 G2 repair-2 review packet

Status: `PENDING_HUMAN_REAPPROVAL`

The repair-2 packet closes the runtime image, Node executable, environment, UDS identity, and Responses structured-output blockers using synthetic/offline evidence only. The exact candidate is `gpt-5.6-luna`; aliases and fallback models are forbidden.

The approved repair-1 record remains immutable and applies only to its original design and proxy hashes. This repair changes the request schema, transport design, and proxy source, so it cannot use the old approval.

| Artifact | SHA-256 |
| --- | --- |
| Design | `5cf88b254d3b4c825473c5303a77d90ceee8e8282c72822ecfd6e4f82676f6b8` |
| Proxy source | `a5e42fd6b49e9606147e0e13fe56d818deb21ac0d2f70319e3547188573f2cca` |
| Request schema | `90561f21be568a6375579cef1d59fe86186abf4b25c8dc550aa173d86dbeab5e` |
| Response schema | `c2e0dd82f46122f497bb30fca7b39ed6f68f9bd524a82461840f42a7d5587ffa` |

The pending approval template is `benchmarks/external-oss-v8/credential-transport/human-approval-repair-2.template.json`. No approved repair-2 record or runtime identity receipt is created.

Claim boundary: provider requests `0`, runtime canary `NOT_RUN`, dispatch `NOT_RUN`, and no credential, prompt, response, or runtime evidence is claimed.
