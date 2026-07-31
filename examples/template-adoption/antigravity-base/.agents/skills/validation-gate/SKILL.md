---
name: validation-gate
description: Check governance documents and verification state before implementation, release, or handoff.
---

# Validation Gate

## Trigger

Use before starting implementation, before reporting completion, or before handing work to another agent.

## Steps

1. Check PROJECT_BRIEF.md, SPEC.md, CONTEXT.md, TASK_CONTRACT.md, OPEN_LOOPS.md, AGENTS.md, and TECH_STACK.md.
2. Evaluate GATE-INTENT-001 and GATE-ROUTE-001 only from AGENTS.md; do not restate their lifecycle fields.
3. Confirm conditional documents exist when the project surface requires them.
4. Run the repo-specific verification command if AGENTS.md defines one.
5. Report passed checks, blocked checks, and open loops without treating warnings as completion.
