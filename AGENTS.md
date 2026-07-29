# AGENTS.md

## Role

This repository is the source starter for agent-native project governance. Maintain it as a reusable open-source starter, not as one specific product project.

AGENTS.md is the canonical source of truth for repository rules. Claude and Antigravity files are thin adapters only.

## Required Read Order

1. `README.md` for positioning and public usage.
2. `startup/00-agent-start-here.md` for mandatory agent behavior.
3. `startup/01-bootstrap-gates.md` for Q1-Q9 intake gates.
4. `startup/02-required-project-docs.md` for fixed and conditional output docs.
5. Relevant files in `workflows/` only when the task touches that area.

## Commands

| Purpose | Command |
|---|---|
| Check scripts | `npm run check` |
| Validate starter | `npm run validate` |
| Initialize Codex smoke project | `npm run smoke:base` |
| Initialize all-runtime smoke project | `npm run smoke:fullstack` |
| Full local CI | `npm run ci` |
| Strict fullstack example doctor | `node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas` |
| Strict macOS example doctor | `node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff` |

## Editing Rules

- Preserve existing user changes; do not revert dirty files unless explicitly asked.
- Keep public positioning conservative: this is a governance starter, not proof of external adoption.
- Do not add root numbered workflow files. Workflow docs live under `startup/` or `workflows/`.
- Do not add a root `codex_mvp_prd_pack.md`; PRD/MVP material belongs in templates or workflow docs.
- When adding a template, update `templates/README.md`, `startup/02-required-project-docs.md` if needed, and `scripts/validate-starter.mjs` if the template becomes required.
- When adding a runtime adapter, keep AGENTS.md canonical and update `README.md`, `scripts/init.mjs`, and `scripts/validate-starter.mjs`.

## Rule Lifecycle

- Promote a new hard gate only after two independent repeated failures or one irreversible or high-severity event.
- Give every durable rule one canonical owner; adapters and workflows reference the rule instead of copying its lifecycle state.
- Use only `active` or `suspended` while a gate remains canonical. Suspend a broken gate before consumers stop using it.
- Record each addition, change, suspension, or retirement in `CHANGELOG.md`; retirement removes the canonical definition and leaves a `retired` or `superseded-by` tombstone.

## Coding Discipline

- Think before coding: state assumptions, surface tradeoffs, and ask when multiple interpretations would change the implementation.
- Keep changes simple: solve the current request with the minimum code and avoid speculative abstraction or configurability.
- Make surgical edits: touch only files and lines tied to the request, preserve existing style, and only remove unused code created by your change.
- Define success before implementation: for non-trivial work, use a short plan with verification for each step, then loop until checks pass or blockers are explicit.

## Verification

Before reporting complete, run the validation commands relevant to the changed surface. For public-ready changes, run the full command set listed above.
