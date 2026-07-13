# START_HERE.md

## Purpose

This project was initialized from agent-governance-starter. The agent must complete intake, project documents, and a task contract before implementation starts.

## Read Order

1. This file.
2. The runtime instruction file for the active agent: `AGENTS.md`, `CLAUDE.md`, or `.agents/AGENTS.md`.
3. Required documents listed below.
4. Included profile documents listed below.
5. Conditional documents when the project type requires them.

## Runtime

- Initialized agent: {{AGENT}}
- Init profile: {{PROFILE_NAME}}

## Q1-Q9 Intake

{{INTAKE_QUESTIONS}}

## Governance Gate References

`AGENTS.md` is the sole canonical owner of gate lifecycle fields. Follow these IDs without copying their owner, status, evidence, review trigger, or fallback into this file:

- `GATE-INTENT-001`
- `GATE-ROUTE-001`

## Product Shape / Technology Route Method

- `user-declared route`: when the user has named a product shape or technology route, check it against Q1-Q9 and record gaps or risks.
- `ai-recommended route`: when the user has not named a route, recommend one first-version product shape and one main technology route from Q1-Q9.

Record the selected mode and product-shape decision in `PROJECT_BRIEF.md`, and the main technology route in `TECH_STACK.md`. Evaluate lifecycle state only from the gate IDs in `AGENTS.md`.

## Required Documents

{{REQUIRED_DOCUMENTS}}

## Included Profile Documents

{{INCLUDED_PROFILE_DOCUMENTS}}

## Conditional Documents

{{CONDITIONAL_DOCUMENTS}}

## Gate

Do not write code until `GATE-INTENT-001` and `GATE-ROUTE-001` pass under their current definitions in `AGENTS.md`, required documents are filled, open loops are explicit, and the user confirms the task plan.
