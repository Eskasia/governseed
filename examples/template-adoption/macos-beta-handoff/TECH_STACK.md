# TECH_STACK.md

## Technology route decision

- Decision mode: user-declared route
- Primary route: native macOS app beta package with stable bundle identity
- Rationale: the first-release risk is TCC, signing, and app path stability, which must be verified on the native macOS release surface.
- Excluded routes: no web app, iOS app, mini program, API-only service, or Electron, because none represents the target TCC behavior or each introduces an unnecessary runtime.
- Late-stage risks: differences in signing identity, bundle id, build path, and macOS version distort tester evidence.
- Re-evaluation triggers: re-evaluate if the test target becomes a cross-platform UI or TCC permissions are no longer needed.
- New technology gate: before adding packaging, notarization, auto-update, or telemetry tooling, update MACOS_RELEASE_CHECKLIST and TESTER_HANDOFF.
- Decision status: active
- Evidence: SRC-201, SRC-202, REQ-201@1, REQ-202@1
- Nearest alternative: cross-platform desktop wrapper
- Review trigger: event-only when native TCC behavior stops being required or cross-platform delivery becomes mandatory

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | SwiftUI / AppKit | project pinned | Native permissions and menu bar behavior | Web app |
| Backend | n/a | n/a | Beta handoff only validates local app behavior | API service |
| Database | n/a | n/a | No persistent shared data in fixture | SQLite |
| Main framework / SDK | macOS SDK | target version in SPEC | TCC behavior matters | Electron |
| Package manager | n/a | n/a | Native project tooling owns dependencies | npm |
| Deployment | DMG / app path | current release tool | Tester handoff | zip |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record macOS version used for beta QA.

## Constraints

- Bundle id, path, and signing identity must stay stable.
