# PROJECT_BRIEF.md

## One-line summary

Let beta testers verify a macOS menu bar app with a fixed signature and a fixed path.

## Users

- Beta testers
- Developers

## Problem

Development builds have an unstable TCC identity, so permissions frequently break after a rebuild.

## MVP

- Provide a DMG or an app path.
- Test the Accessibility and ScreenCapture permissions.
- Report launch and permission state.

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-201 | synthetic | attestation-only | n/a | no | confirmed | release-owner-role | 2026-07-13 |
| SRC-202 | synthetic | attestation-only | n/a | no | confirmed | tester-role | 2026-07-13 |

## Product shape decision

- Decision mode: user-declared route
- Product shape: macOS desktop app beta handoff
- Q1-Q9 basis: the acceptance owner must test a fixed signature, a fixed path, TCC permissions, and launch state; the problem itself is bound to macOS permission behavior.
- Why not website / app / mini program / backend-only / admin system or another shape: web, mobile, mini program, and API surfaces cannot verify macOS Accessibility, ScreenCapture, bundle id, or signing identity.
- Re-evaluate when: core acceptance no longer depends on macOS TCC, or a cross-platform desktop shell is needed; then reconsider web / Electron / a multi-platform app.
- Decision status: active
- Evidence: SRC-201, SRC-202, REQ-201@1, REQ-202@1
- Nearest alternative: cross-platform desktop wrapper
- Review trigger: event-only when TCC is no longer an acceptance constraint or a cross-platform shell becomes mandatory

## Explicitly out of scope

- No App Store release.
- No auto-update.
- No feature expansion beyond the formal notarization gate.

## Acceptance owner

- Beta testers report against the flow specified in TESTER_HANDOFF.

## Done criteria

- A tester can complete the test without reading developer documentation.
