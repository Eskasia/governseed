# TECH_STACK.md

## Technology route decision

- Decision mode: user-declared route
- Primary route: server-rendered web dashboard with a token-driven component layer
- Rationale: the first-release risk is inconsistent status representation, so color, type scale, and spacing must collapse into one token set rendered directly by the existing backend, with no extra state-sync layer.
- Excluded routes: no native app, desktop shell, mini program, or heavy single-page frontend framework, because the misreading problem is in the visual system rather than interaction complexity, and changing runtime only adds migration risk.
- Late-stage risks: if tokens land only in documents and not in code, the screens diverge again; third-party component library defaults override the tokens.
- Re-evaluation triggers: re-evaluate if the dispatch flow becomes mobile-first or real-time collaboration cursors are needed.
- New technology gate: before introducing any UI component library or CSS framework, record in DESIGN_SYSTEM how it maps to and conflicts with the existing tokens.
- Decision status: active
- Evidence: SRC-301, SRC-302, REQ-301@1, REQ-302@1
- Nearest alternative: single-page front-end framework with a design-system package
- Review trigger: event-only when mobile-first dispatch or real-time collaboration becomes required

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Server-rendered templates plus CSS custom properties | project pinned | Tokens apply without a client build step | SPA framework |
| Backend | Existing order service | unchanged | This project does not change business logic | New BFF layer |
| Database | Existing operational store | unchanged | No schema change in scope | New read model |
| Main framework / SDK | Project template engine | project pinned | Already owned by the team | Component library |
| Package manager | Project standard | project pinned | No new toolchain introduced | Alternative registry |
| Deployment | Existing internal release pipeline | unchanged | Dashboard ships with the service | Separate static host |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record the browser versions used for the desktop and tablet design review.

## Constraints

- Every color, spacing, and radius value used in a screen must come from a declared token.
