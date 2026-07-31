# GovernSeed Launch One-Pager Fixture

This fixture demonstrates a filled GovernSeed base profile for a communication deliverable: a one-pager and a ten-minute deck whose every factual statement resolves to a project document.

## Start Here

1. Read `START_HERE.md` in generated projects.
2. Read `AGENTS.md`.
3. Review fixed documents, then `PRESENTATION_BRIEF.md` and its claim-to-source map.
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

- PRESENTATION_BRIEF.md: Has presentation / slide deck / one-pager deliverable

## Validation

```bash
node scripts/doctor.mjs --strict --json examples/template-adoption/launch-one-pager
```
