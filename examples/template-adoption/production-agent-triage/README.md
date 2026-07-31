# GovernSeed Production Agent Triage Fixture

This fixture demonstrates a filled GovernSeed base profile for a production-facing agent: a runtime contract with a mandatory approval gate, a security review, an evaluation plan, an environment checklist, and the research synthesis behind its action boundary.

## Start Here

1. Read `START_HERE.md` in generated projects.
2. Read `AGENTS.md`.
3. Review fixed documents, then `AGENT_RUNTIME.md`, `AI_SECURITY_REVIEW.md`, `EVAL_PLAN.md`, `ENV_CHECKLIST.md`, and `RESEARCH_SYNTHESIS.md`.
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

- AGENT_RUNTIME.md: Has production-facing LLM agent / automation
- AI_SECURITY_REVIEW.md: Has prompt injection / tenant data / PII risks
- EVAL_PLAN.md: Has LLM/RAG/agent output needing regression testing
- ENV_CHECKLIST.md: Has deployment / third-party API keys
- RESEARCH_SYNTHESIS.md: Has material evidence conflict / high-impact decision / multiple credible routes, and user confirms synthesis

## Validation

```bash
node scripts/doctor.mjs --strict --json examples/template-adoption/production-agent-triage
```
