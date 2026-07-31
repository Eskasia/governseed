# PROJECT_BRIEF.md

## One-line summary

Let a new project complete a minimal governance bootstrap before any code is written.

## Users

- Project maintainers
- Coding agent

## Problem

A blank prompt lets an agent start implementing before the requirements, verification, and open loops are clear.

## MVP

- Generate the fixed governance documents.
- Let doctor confirm the fixed documents are filled in.
- Keep an explicit place for open loops.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |
| SRC-002 | public | public-pointer | https://github.com/Eskasia/governseed | no | confirmed | maintainer-role | 2026-07-13 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: governance CLI / document generator
- Q1-Q9 basis: users and coding agents need documents, verification, and open loops settled before writing code; no user interface or application runtime is required.
- Why not website / app / mini program / backend-only / admin system or another shape: the first release only verifies document generation and doctor signals; a UI, native shell, API service, or admin workflow each adds an unnecessary runtime boundary.
- Re-evaluate when: interactive onboarding, a hosted doctor dashboard, or multi-user management is needed; then reconsider a web app / management system.
- Decision status: active
- Evidence: SRC-001, SRC-002, REQ-001@1, REQ-002@1
- Nearest alternative: hosted governance dashboard
- Review trigger: event-only when onboarding becomes interactive or governance state must be shared remotely

## Explicitly out of scope

- No app runtime is provided.
- No product feature examples are provided.
- No external adoption is claimed.

## Acceptance owner

- Repo maintainer runs `node scripts/doctor.mjs --json examples/template-adoption/base-minimal`.

## Done criteria

- doctor JSON status is `ready`.
