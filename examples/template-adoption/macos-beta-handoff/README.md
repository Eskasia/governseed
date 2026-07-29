# GovernSeed macOS Beta Handoff Fixture

This fixture demonstrates a filled GovernSeed macOS profile with release and tester handoff documents.

## Start Here

1. Read `START_HERE.md` in generated projects.
2. Read `AGENTS.md`.
3. Review fixed and macOS profile documents.
4. Run strict doctor from the starter repo.

## Runtime

- Initialized agent: codex
- Init profile: macos

## Required Documents

- README.md: Every project
- PROJECT_BRIEF.md: Every project
- SPEC.md: Every project
- CONTEXT.md: Every project
- TASK_CONTRACT.md: Every project
- OPEN_LOOPS.md: Every project
- AGENTS.md: Every project
- TECH_STACK.md: Every project

## Included Profile Documents

- MACOS_RELEASE_CHECKLIST.md: macOS profile
- TESTER_HANDOFF.md: macOS profile

## Validation

```bash
node scripts/doctor.mjs --strict --json examples/template-adoption/macos-beta-handoff
```
