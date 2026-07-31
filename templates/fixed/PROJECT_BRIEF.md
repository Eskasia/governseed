# PROJECT_BRIEF.md

## One-line summary

-

## Users

-

## Problem

-

## MVP

-

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

### Source rules

- This registry stores attestations and pointers, never private source content.
- Source IDs are append-only. Do not delete or reuse an ID when intent changes.
- `public` uses a canonical HTTPS `public-pointer`; `approved-private-external` uses an `external-record:<opaque-id>` pointer; `private-interactive` uses `attestation-only` plus `n/a`; `synthetic` uses `attestation-only` plus `n/a` or a canonical public pointer.
- Private and synthetic sources set `Content retained` to `no`.
- Do not store an ordinary hash or masked excerpt of private content, a private URL or query token, an absolute home path, a real person identifier, or a credential.
- Record confirmation with a lowercase `*-role` label and ISO date; pending/rejected rows may leave the date `n/a`. The requirement revision must repeat a confirmed source role exactly. Keep every not-stated item in `OPEN_LOOPS.md`.
- Product-shape `Evidence` contains at least one confirmed `SRC` and one active `REQ@revision`, and exactly matches the evidence set in `TECH_STACK.md`.

## Product shape decision

- Decision mode:
- Product shape:
- Q1-Q9 basis:
- Why not website / app / mini program / backend-only / admin system or another shape:
- Re-evaluate when:
- Decision status:
- Evidence:
- Nearest alternative:
- Review trigger:

## Explicitly out of scope

-

## Acceptance owner

-

## Done criteria

- A new agent understands the direction within 30 seconds.
- Problem, users, and MVP are not collapsed into one sentence.
- The product shape and the excluded shapes are both written down.
