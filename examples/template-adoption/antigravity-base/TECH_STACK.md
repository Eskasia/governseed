# TECH_STACK.md

## Technology route decision

- Decision mode: user-declared route
- Primary route: Node.js CLI and markdown template generator
- Rationale: this fixture verifies that the generator output matches the checked-in files; Node.js directly supports a cross-platform CLI, JSON profiles, and fixture smoke, with no app runtime needed.
- Excluded routes: no web app, mobile app, backend API, or database service, because the fixture has no user-facing UI, data persistence, or network service requirement.
- Late-stage risks: if the Antigravity adapter starts needing interactive installation or remote state, single-file scripts and markdown templates may not be enough.
- Re-evaluation triggers: re-evaluate when a hosted dashboard, multi-user state, a remote API, or an interactive wizard is needed.
- New technology gate: before adding a framework, SDK, provider, or database, prove it directly improves init / doctor / fixture validation and does not turn the starter into a runtime framework.
- Decision status: active
- Evidence: SRC-001, SRC-002, REQ-001@1, REQ-003@1
- Nearest alternative: assert the adapter strings in tests only, without keeping a fixture
- Review trigger: event-only when the Antigravity adapter gains a surface the generator does not own

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | n/a | n/a | No user-facing UI in this fixture | Website |
| Backend | Node.js scripts | >=20 | Cross-platform CLI and validator scripts | Shell scripts |
| Database | n/a | n/a | No persistent runtime state | SQLite |
| Main framework / SDK | Node.js standard library | >=20 | Avoid dependency burden for starter smoke | CLI framework |
| Package manager | npm | bundled with Node.js | Existing script runner | pnpm |
| Deployment | n/a | n/a | Source repo and local scripts only | Hosted service |

- Node.js: >=20

## Scripts

- init: `node scripts/init.mjs`
- doctor: `node scripts/doctor.mjs`
- runtime file smoke: `node scripts/smoke-antigravity.mjs`

## Services

- None.

## Constraints

- No package dependencies are required for this fixture.
- No application runtime is generated.
- No external credentials are used.
- `.agents/` is generated output and is never hand-edited.
