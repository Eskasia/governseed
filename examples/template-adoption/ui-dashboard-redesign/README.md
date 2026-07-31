# GovernSeed UI Dashboard Redesign Fixture

This fixture demonstrates a filled GovernSeed base profile for a UI-heavy project: design rules extracted from existing screens, a screen and state specification, and a completed design review.

## Start Here

1. Read `START_HERE.md` in generated projects.
2. Read `AGENTS.md`.
3. Review fixed documents, then `UI_SPEC.md`, `DESIGN_SYSTEM.md`, and `DESIGN_REVIEW.md`.
4. Run strict doctor from the starter repo.

## Runtime

- Initialized agent: codex
- Init profile: base

## Required Documents

- README.md: Every project
- PROJECT_BRIEF.md: Every project
- SPEC.md: Every project
- CONTEXT.md: Every project
- TASK_CONTRACT.md: Every project
- OPEN_LOOPS.md: Every project
- AGENTS.md: Every project
- TECH_STACK.md: Every project

## Included Conditional Documents

- UI_SPEC.md: Has UI / website / dashboard / landing page
- DESIGN_SYSTEM.md: Has screenshots / existing UI to extract design rules from
- DESIGN_REVIEW.md: Has UI review / beta / launch / visual QA

## Validation

```bash
node scripts/doctor.mjs --strict --json examples/template-adoption/ui-dashboard-redesign
```
