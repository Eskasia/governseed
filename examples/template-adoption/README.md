# Template Adoption Examples

Each subdirectory is a filled example demonstrating how the project templates work together for a specific project type.

These are **not production projects**. They are adoption proofs showing that templates can be coherently filled across different scenarios.

They are also not governance-impact A/B evidence. Do not count these fixture doctors, expected JSON files, or generated documents as paired evaluator runs or as proof that governance improves delivery.

## Fixtures

| Directory | Scenario | Key Templates Demonstrated |
|---|---|---|
| `antigravity-base/` | Minimal ready base profile initialized for the Antigravity runtime | Fixed docs + generated `.agents/` adapter |
| `base-minimal/` | Minimal ready base profile fixture | Fixed docs + expected doctor JSON |
| `fullstack-ai-saas/` | AI-powered SaaS with RAG, eval pipeline, and security review | Fixed docs + RAG_DESIGN, EVAL_PLAN, AI_SECURITY_REVIEW |
| `launch-one-pager/` | Launch one-pager and ten-minute deck with a claim-to-source map | Fixed docs + PRESENTATION_BRIEF |
| `macos-beta-handoff/` | macOS app beta release with tester handoff | Fixed docs + MACOS_RELEASE_CHECKLIST, TESTER_HANDOFF |
| `production-agent-triage/` | Production support-triage agent with eval, security review, and env checklist | Fixed docs + AGENT_RUNTIME, AI_SECURITY_REVIEW, EVAL_PLAN, ENV_CHECKLIST, RESEARCH_SYNTHESIS |
| `ui-dashboard-redesign/` | UI-heavy dashboard redesign with a token-level design system | Fixed docs + UI_SPEC, DESIGN_SYSTEM, DESIGN_REVIEW |

The fixture table above is checked against the registered fixture list in `scripts/fixtures-check.mjs`; adding a fixture without listing it here fails `npm run fixtures`.

## Validation

The CI workflow checks each fixture with its declared profile and compares each `expected/doctor.json` against live `doctor --json` output.

`README.md`, `PROJECT_BRIEF.md`, `SPEC.md`, `CONTEXT.md`, `TASK_CONTRACT.md`, `OPEN_LOOPS.md`, `AGENTS.md`, `TECH_STACK.md`.

Governance-impact scenarios live separately under `tests/governance-impact/scenarios/`. Their canonical facts, hashes, fact parity, oracle checks, and allowed/forbidden paths follow `docs/governance-impact-eval.md`. The evaluator portion of public CI runs deterministic offline checks only; real paired evaluation is explicit, synthetic-only, and never part of template-adoption fixture validation.
