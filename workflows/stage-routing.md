# Stage Routing

Purpose: when the user is not saying "start a new project" but describing, in their own words, the stage they are at, who they are delivering to, or what they want produced, this file tells the agent immediately which documents to read, what to produce, and where to stop.

## Usage Rules

- First identify which stage the user is describing; do not start writing code.
- After reading this file, add only the minimum documents that stage needs.
- The output must be a reviewable file, URL, test command, or explicit list.
- When information is missing, ask one question at a time, and only about something that affects the delivery.

## Stage Routing Table

| The user says | Read immediately | Main output | Stop condition |
|---|---|---|---|
| I want to give this to testers, let people try it, an internal build, a beta test | `workflows/validation-release.md`, `templates/conditional/TESTER_HANDOFF.md`; if there is UI, also `workflows/ui-ux.md` | `TESTER_HANDOFF.md`, test paths, known limitations, reporting format | A tester who has the document can operate it and report issues alone |
| I want a preview, a link someone else can open | `workflows/validation-release.md`; if there is web/DB, also `workflows/fullstack.md` | Preview URL, env check, smoke test results | The preview opens and the core flow works |
| I want to go live, release, ship | `workflows/validation-release.md`; plus the UI/fullstack/macOS/agent documents that match the project type | Release checklist, verification results, rollback or known limitations | The launch conditions and blockers are clear |
| I want a UI check, screen polish, something to show people | `workflows/ui-ux.md`, `workflows/validation-release.md` | `DESIGN_REVIEW.md`, desktop/mobile checks, console results | The core screens, states, and text overflow have been checked |
| I want a prototype first, try a few directions, validate the state model, see whether the interaction flows | `workflows/ui-ux.md`, `workflows/validation-release.md` | Disposable prototype, UI variants, state-model demo, an adopt/discard decision | A direction is chosen or explicitly dropped, and the prototype is not treated as production code |
| I have app screenshots and want a design system, design mockups, icons, or background assets | `workflows/ui-ux.md`, `workflows/design-system-from-screenshots.md` | `DESIGN_SYSTEM.md`, screen map, design tokens, `assets/ASSET_MANIFEST.md` | The system traces back to the screenshots, the mockups cover tabs/modals/states, and asset naming is clear |
| I want to confirm the database / API / auth / permissions | `workflows/fullstack.md`, `startup/02-required-project-docs.md` | `DATA_MODEL.md`, `API_CONTRACT.md`, RLS / permission risks | The data boundary and verification method are clear |
| I want to build an agent, automation, human approval, background tasks | `workflows/production-agent.md`, `workflows/validation-release.md` | `AGENT_RUNTIME.md`, tool permissions, side effects, approval gate | State, events, tools, and verifiers are defined |
| I want to compare several viewpoints, resolve conflicting evidence, research a major choice, or find cross-perspective blind spots | `workflows/research-synthesis.md`, `templates/conditional/RESEARCH_SYNTHESIS.md` | A trigger proposal plus user confirmation; after confirmation, `RESEARCH_SYNTHESIS.md` | Evidence, contradictions, confidence, hidden connections, and the decision recommendation are all traceable |
| I want to package a macOS app, handle permissions, DMG, notarization | `workflows/macos-build-release.md`, `workflows/validation-release.md` | `MACOS_RELEASE_CHECKLIST.md`, signing / TCC / packaging verification | The bundle id, paths, signing, and verification results are fixed and clear |
| I want a presentation, PPT, proposal, launch page, one-pager, white paper, resume, portfolio, landing page | `workflows/presentation.md` | `PRESENTATION_BRIEF.md`, deck / PDF / HTML path or preview URL | The message, sources, format, fonts, and layout match how it will be used |
| I want to wrap up, hand off, pick this up next time | `workflows/agent-file-structure.md`, `workflows/validation-release.md` | Handoff, open loops, document-structure routing | The next agent can take over and knows what not to do |

## Delivering To Testers

Trigger words: tester, try it out, internal build, beta, QA, ask a friend to test, let someone use it, test document, report issues.

Minimum flow:

1. Confirm who is testing and in what environment: local, preview, TestFlight, DMG, accounts, test data.
2. Run the minimum verification: startup, core flow, console/log, known errors.
3. Produce `TESTER_HANDOFF.md`; its contents must let a tester start without reading any development docs.

`TESTER_HANDOFF.md` required fields:

- Test purpose:
- Test URL or file path:
- Test account or test data:
- The 3 core paths to test:
- Out of scope for testing:
- Known limitations:
- Issue reporting format:
- Screenshot or recording requirements:
- Test cutoff condition:
- Verified by the developer:

## Report Format

```md
Stage routing:
- Stage identified:
- Read:
- Output needed:
- Missing information:
- Next step:
```
