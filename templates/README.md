# Templates

這裡只放新專案常用文件骨架。建立專案文件時可以複製，但不要把空模板當成完成狀態。

## Layout

- `fixed/`: every generated project should receive these governance docs.
- `conditional/`: profile- or project-type-specific docs.
- `runtime/`: canonical AGENTS template material. Claude and Antigravity adapters must stay thin.

| Template | Required | Trigger | Related workflow |
|---|---|---|---|
| `runtime/README.md` | Yes | Every project | `startup/00-agent-start-here.md` |
| `fixed/PROJECT_BRIEF.md` | Yes | Every project | `startup/01-bootstrap-gates.md` |
| `fixed/SPEC.md` | Yes | Every project | `startup/01-bootstrap-gates.md` |
| `fixed/CONTEXT.md` | Yes | Every project | `startup/01-bootstrap-gates.md` |
| `fixed/TASK_CONTRACT.md` | Yes | Every project | `startup/01-bootstrap-gates.md` |
| `fixed/OPEN_LOOPS.md` | Yes | Every project | `startup/01-bootstrap-gates.md` |
| `fixed/TECH_STACK.md` | Yes | Every project | `startup/02-required-project-docs.md` |
| `runtime/START_HERE.md` | Runtime | Generated first-read project entrypoint | `startup/00-agent-start-here.md` |
| `runtime/AGENTS.md` | Runtime | Generated canonical project entrypoint | `workflows/agent-file-structure.md` |
| `conditional/UI_SPEC.md` | Conditional | UI, website, app, dashboard, landing page | `workflows/ui-ux.md` |
| `conditional/DESIGN_SYSTEM.md` | Conditional | Existing screenshots, competitor UI, design tokens | `workflows/design-system-from-screenshots.md` |
| `conditional/DESIGN_REVIEW.md` | Conditional | UI review, beta, launch, visual QA | `workflows/ui-ux.md` |
| `conditional/DATA_MODEL.md` | Conditional | Database, Auth, tenant, permissions, core entities | `workflows/fullstack.md` |
| `conditional/API_CONTRACT.md` | Conditional | API routes, server actions, webhooks, adapters | `workflows/fullstack.md` |
| `conditional/ENV_CHECKLIST.md` | Conditional | Deployment, third-party APIs, env vars, secrets | `workflows/fullstack.md` |
| `conditional/PRESENTATION_BRIEF.md` | Conditional | Slides, one-pager, white paper, resume, portfolio | `workflows/presentation.md` |
| `conditional/RESEARCH_SYNTHESIS.md` | Conditional | Material evidence conflict, high-impact decision, multiple credible routes, user-confirmed synthesis | `workflows/research-synthesis.md` |
| `conditional/TESTER_HANDOFF.md` | Conditional | Beta, tester handoff, preview sharing | `workflows/stage-routing.md` |
| `conditional/MACOS_RELEASE_CHECKLIST.md` | Conditional | macOS build, signing, TCC, DMG, notarization | `workflows/macos-build-release.md` |
| `conditional/AGENT_RUNTIME.md` | Conditional | Production-facing LLM agent, automation, tool use | `workflows/production-agent.md` |
| `conditional/RAG_DESIGN.md` | Conditional | Retrieval, knowledge base, document Q&A, citation | `workflows/ai-system-design.md` |
| `conditional/EVAL_PLAN.md` | Conditional | LLM, RAG, agent regression testing | `workflows/ai-system-design.md` |
| `conditional/AI_SECURITY_REVIEW.md` | Conditional | Prompt injection, tenant data, PII, tool risk | `workflows/ai-system-design.md` |
