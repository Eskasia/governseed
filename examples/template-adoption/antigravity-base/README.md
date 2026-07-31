# GovernSeed Antigravity Base Fixture

This fixture demonstrates a filled GovernSeed base profile project initialized
for the Antigravity runtime. Its distinguishing content is the generated
`.agents/` adapter, which the other fixtures do not carry.

## Start Here

1. Read `START_HERE.md` in generated projects.
2. Read `AGENTS.md`.
3. Read `.agents/AGENTS.md` and the skills it lists.
4. Run doctor from the starter repo.

## Runtime

- Initialized agent: antigravity
- Init profile: base
- Runtime files: `.agents/AGENTS.md`, `.agents/skills/bootstrap-intake/SKILL.md`, `.agents/skills/validation-gate/SKILL.md`

## Required Documents

- README.md: Every project
- PROJECT_BRIEF.md: Every project
- SPEC.md: Every project
- CONTEXT.md: Every project
- TASK_CONTRACT.md: Every project
- OPEN_LOOPS.md: Every project
- AGENTS.md: Every project
- TECH_STACK.md: Every project

## Validation

```bash
node scripts/doctor.mjs --json examples/template-adoption/antigravity-base
node scripts/smoke-antigravity.mjs
```
