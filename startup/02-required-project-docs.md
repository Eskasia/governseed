# 02 Required Project Docs

## Fixed Documents

| File | Purpose | Done criteria |
|---|---|---|
| `README.md` | The project entry point after initialization, the read order, the doctor command | A new agent finds `START_HERE.md` and the runtime entrypoint first |
| `PROJECT_BRIEF.md` | The project's one-line summary, users, problem, MVP, and product shape decision | A new agent understands the direction in 30 seconds |
| `SPEC.md` | Scope, non-goals, acceptance criteria | Every acceptance criterion is judged yes/no |
| `CONTEXT.md` | Shared language, roles, data objects, easily confused terms | Terms stop drifting |
| `TASK_CONTRACT.md` | The MVP broken into executable tasks | Every task has an input, tools, an output, a verification, and what is out of scope |
| `OPEN_LOOPS.md` | Open questions, risks, items awaiting confirmation | The unknown is not treated as known |
| `AGENTS.md` | Agent rules inside the project | Common commands, prohibitions, and test conventions are explicit |
| `TECH_STACK.md` | Technology route, frontend, backend, database, framework / SDK, deployment, versions | Technology choices are traceable |

The generated `AGENTS.md` is the only lifecycle owner of `GATE-INTENT-001` and `GATE-ROUTE-001`; the other fixed documents only hold the evidence those gates need, or cite the IDs.

## Document-structure Routing

At wrap-up, decide where a new lesson belongs; see `workflows/agent-file-structure.md`.

## Conditional Documents

| File | When it is needed |
|---|---|
| `UI_SPEC.md` | There is any UI, website, app, admin panel, dashboard, or landing page |
| `DESIGN_SYSTEM.md` | There are screenshots, an existing UI, or competitor screens to reverse-engineer a design system, mockups, tokens, icons, or background assets from |
| `DESIGN_REVIEW.md` | The UI is going to testers, is launching, or a design review must be recorded |
| `DATA_MODEL.md` | There is a DB, Auth, tenant, permissions, or core data objects |
| `API_CONTRACT.md` | There is frontend-backend data exchange, an API route, a server action, a webhook, or an adapter |
| `ENV_CHECKLIST.md` | Something is being deployed, or integrated with OpenAI/Supabase/Stripe/Email/Storage/a third-party API |
| `RESEARCH_SYNTHESIS.md` | A decision has conflicting evidence, is high-impact or hard to reverse, or has several credible routes, and the user confirmed the research synthesis |
| `MACOS_RELEASE_CHECKLIST.md` | Building / packaging a macOS app, or dealing with TCC permissions, signing, or notarization |
| `AGENT_RUNTIME.md` | A production-facing LLM agent, automation, multi-step tool calls, or human approval |
| `RAG_DESIGN.md` | There is retrieval, a knowledge base, document Q&A, citation, or permission-aware search |
| `EVAL_PLAN.md` | LLM / RAG / agent output needs regression verification, a golden set, LLM-as-judge, or online monitoring |
| `AI_SECURITY_REVIEW.md` | There is prompt injection, tool use, tenant data, PII, permissions, external actions, or HTML / SQL / shell output |
| `docs/adr/*.md` | A hard-to-reverse choice of architecture, data model, deployment, or external service |

## TASK_CONTRACT Task Format

```md
## Task: <task name>

- Input:
- Available tools:
- Expected output:
- Verification:
- Out of scope:
```
