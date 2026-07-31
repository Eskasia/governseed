# PROJECT_BRIEF.md

## One-line summary

Prove that the Antigravity runtime `.agents/` adapter is produced by the generator rather than a hand-maintained copy.

## Users

- Project maintainers
- Antigravity managed agent

## Problem

Of the three runtimes, only Antigravity has no filled fixture. The generated `.agents/` files have no checked-in counterpart, so nothing fails when the adapter content drifts.

## MVP

- Keep an `.agents/` adapter that is byte-for-byte identical to the generator output.
- Verify that the frontmatter of every SKILL.md can be routed by the runtime.
- Confirm that `--agent codex` does not accidentally generate `.agents/`.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-31 |
| SRC-002 | public | public-pointer | https://github.com/Eskasia/governseed | no | confirmed | maintainer-role | 2026-07-31 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: governance CLI / document generator
- Q1-Q9 basis: the users of this fixture are maintainers and managed agents, who need comparable generated output rather than any user interface or application runtime.
- Why not website / app / mini program / backend-only / admin system or another shape: the fixture only verifies the generated files and doctor signals; a UI, native shell, or API service each introduces a runtime boundary that is not needed here.
- Re-evaluate when: the Antigravity adapter needs an interactive install flow or remotely shared state; then reconsider a web app / management system.
- Decision status: active
- Evidence: SRC-001, SRC-002, REQ-001@1, REQ-003@1
- Nearest alternative: assert the adapter strings in tests only, without keeping a fixture
- Review trigger: event-only when the Antigravity adapter gains a surface the generator does not own

## Explicitly out of scope

- No claim that Antigravity read or executed these files.
- No app runtime is provided.
- No external adoption is claimed.

## Acceptance owner

- Repo maintainer runs `node scripts/doctor.mjs --json examples/template-adoption/antigravity-base`.

## Done criteria

- doctor JSON status is `ready`.
