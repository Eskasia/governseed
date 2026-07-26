# Template Adoption Examples

Each subdirectory is a filled example demonstrating how the project templates work together for a specific project type.

These are **not production projects**. They are adoption proofs showing that templates can be coherently filled across different scenarios.

They are also not governance-impact A/B evidence. Do not count these fixture doctors, expected JSON files, or generated documents as paired evaluator runs or as proof that governance improves delivery.

## Fixtures

| Directory | Scenario | Key Templates Demonstrated |
|---|---|---|
| `base-minimal/` | Minimal ready base profile fixture | Fixed docs + expected doctor JSON |
| `fullstack-ai-saas/` | AI-powered SaaS with RAG, eval pipeline, and security review | Fixed docs + RAG_DESIGN, EVAL_PLAN, AI_SECURITY_REVIEW |
| `macos-beta-handoff/` | macOS app beta release with tester handoff | Fixed docs + MACOS_RELEASE_CHECKLIST, TESTER_HANDOFF |

## Validation

The CI workflow checks each fixture with its declared profile and compares each `expected/doctor.json` against live `doctor --json` output.

`README.md`, `PROJECT_BRIEF.md`, `SPEC.md`, `CONTEXT.md`, `TASK_CONTRACT.md`, `OPEN_LOOPS.md`, `AGENTS.md`, `TECH_STACK.md`.

Governance-impact scenarios live separately under `tests/governance-impact/scenarios/`. Their canonical facts, hashes, fact parity, oracle checks, and allowed/forbidden paths follow `docs/governance-impact-eval.md`. The evaluator portion of public CI runs deterministic offline checks only; real paired evaluation is explicit, synthetic-only, and never part of template-adoption fixture validation.
