# PROJECT_BRIEF.md

## One-line summary

Reverse-engineer a design system from screenshots of the existing screens and rebuild the frontend of an internal order dispatch dashboard.

## Users

- Dispatchers
- On-duty support staff

## Problem

The current dashboard grew from pages added by many people over three years; the same status is shown with different colors and type sizes on different pages, and dispatchers misread it under pressure.

## MVP

- Extract an actionable design system from screenshots of the existing screens.
- Rebuild the three core screens: dispatch queue, single order, exception handling.
- Cover the loading, empty, and error states on every screen.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-301 | synthetic | attestation-only | n/a | no | confirmed | design-owner-role | 2026-07-31 |
| SRC-302 | synthetic | attestation-only | n/a | no | confirmed | operator-role | 2026-07-31 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: internal operations dashboard, desktop-first web
- Q1-Q9 basis: the users are internal staff at a fixed workstation with several tabs open at once, who need high data density and status consistency rather than a mobile touch experience.
- Why not website / app / mini program / backend-only / admin system or another shape: a mobile app cannot carry a many-row dispatch queue in one viewport; a backend-only change does not solve misreading; a public website is not this audience's entry point.
- Decision status: active
- Evidence: SRC-301, SRC-302, REQ-301@1, REQ-302@1
- Nearest alternative: keep the existing dashboard and only unify colors
- Review trigger: event-only when dispatchers start working from mobile devices or the queue moves into an external product

## Explicitly out of scope

- No mobile native app.
- No changes to the backend data model or API.
- No dark mode.

## Acceptance owner

- A dispatcher completes a full shift flow using the three core screens.

## Done criteria

- One order status uses one token set across all three screens, and every row of the DESIGN_REVIEW state coverage has been checked.
