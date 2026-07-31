# PROJECT_BRIEF.md

## One-line summary

For the public opening of an internal tool, produce a one-pager that stands on its own and a ten-minute deck.

## Users

- Technical decision makers at potential adopters
- Internal presenters

## Problem

The tool has spread only by word of mouth internally, with no forwardable external description; every introduction is retold from scratch and each person states different boundaries.

## MVP

- A one-page HTML description that reads offline and prints to PDF.
- A ten-minute deck with slides separate from speaker notes.
- Every factual statement in both traces back to a project document, with no separate narrative.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-501 | synthetic | attestation-only | n/a | no | confirmed | product-owner-role | 2026-07-31 |
| SRC-502 | synthetic | attestation-only | n/a | no | confirmed | reviewer-role | 2026-07-31 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: static one-pager plus a ten-minute deck
- Q1-Q9 basis: the readers are technical decision makers who receive a forwarded link and decide within three minutes whether to keep reading; they need a static document they can finish alone, not an interactive site or trial environment.
- Why not website / app / mini program / backend-only / admin system or another shape: a multi-page site dilutes the core description; a trial environment demands more than this stage requires; an app or backend is unrelated to conveying the message.
- Decision status: active
- Evidence: SRC-501, SRC-502, REQ-501@1, REQ-502@1
- Nearest alternative: a multi-page marketing site
- Review trigger: event-only when the one-pager stops being the entry point and a trial environment becomes the primary call to action

## Explicitly out of scope

- No multi-page marketing site.
- No customer stories or adoption numbers.
- No interactive demo.

## Acceptance owner

- An internal reviewer who was not on the project reads only the one-pager and can restate the tool's boundaries.

## Done criteria

- Every factual statement in the one-pager and the deck traces back to a project document, with no unverified adoption claim.
