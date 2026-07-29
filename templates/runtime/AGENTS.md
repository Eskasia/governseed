# AGENTS.md

## Project Rules

- Start by reading `START_HERE.md` when it exists.
- Apply the active governance gates below before implementation; other runtime files cite gate IDs and do not own their lifecycle fields.
- Keep every task tied to input, tools, expected output, verification, and explicit non-goals.
- Do not treat `OPEN_LOOPS.md` items as decided.
- Record only stable project-specific rules here.

## Governance Gates

This table is the only canonical definition of generated-project gate state. Allowed status values are `active` and `suspended`; suspend a broken gate before consumers stop citing it.

| ID | Owner path | Status | Evidence | Event-only review trigger | Fallback |
|---|---|---|---|---|---|
| GATE-INTENT-001 | `PROJECT_BRIEF.md` + `SPEC.md` | active | Confirmed SRC -> active REQ -> AC chain | Source conflict; active requirement, acceptance, core user, success behavior, or prohibition changes; trace validation failure | Open a blocking `OPEN_LOOPS.md` item; do not implement |
| GATE-ROUTE-001 | `PROJECT_BRIEF.md` + `TECH_STACK.md` | active | Matching route mode and route evidence tied to active requirements | Immutable-system, deployment, acceptance, or scale constraints change; route validation failure | Set the route decision to `recheck-required`, open a blocking loop, and do not implement |

## Commands

| Purpose | Command |
|---|---|
| Install |  |
| Test |  |
| Lint |  |
| Build |  |
| Dev server |  |

## Verification

- Every implementation task must name its verification command or manual check.
- Final delivery must report checks passed, checks skipped, and blockers.

## Coding Discipline

- Think before coding: state assumptions, surface tradeoffs, and ask when multiple interpretations would change the implementation.
- Keep changes simple: solve the current request with the minimum code and avoid speculative abstraction or configurability.
- Make surgical edits: touch only files and lines tied to the request, preserve existing style, and only remove unused code created by your change.
- Define success before implementation: for non-trivial work, use a short plan with verification for each step, then loop until checks pass or blockers are explicit.

## Do Not

- Do not commit secrets or private tester data.
- Do not expand scope without updating `SPEC.md` and `TASK_CONTRACT.md`.
- Do not add permanent agent rules before deciding whether they belong here, in docs, in skills, in hooks, or in issue templates.

## File Ownership

- Product and scope: `PROJECT_BRIEF.md`, `SPEC.md`
- Shared language: `CONTEXT.md`
- Work execution: `TASK_CONTRACT.md`
- Risks and unresolved items: `OPEN_LOOPS.md`
- Local agent rules and commands: `AGENTS.md`
- Technologies and versions: `TECH_STACK.md`
- Product shape / technology route decision: `PROJECT_BRIEF.md`, `TECH_STACK.md`, and high-cost `docs/adr/*.md`

## Subdirectory Rules

- Add nested `AGENTS.md` files only when a subsystem has different commands, constraints, or ownership.
