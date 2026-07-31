# 00 Agent Start Here

## Rules That Cannot Be Skipped

- The conditions for starting work cite only `GATE-INTENT-001` and `GATE-ROUTE-001` in the generated `AGENTS.md`; this document does not restate their owner, status, evidence, review trigger, or fallback.
- After Q1-Q9, read `workflows/product-shape-tech-route.md` for the decision method, then evaluate both gates per `AGENTS.md`.
- Do not turn a one-sentence user idea directly into a full implementation.
- Do not enable every skill at once; choose tools by risk.
- Every task has an input, available tools, an expected output, a verification, and what is out of scope.
- If UI, data model, deployment, permissions, secrets, or third-party services are unclear on any point, write it into a document or record it as an open loop first.
- Do not push every new rule into `AGENTS.md`; use `workflows/agent-file-structure.md` to decide whether it belongs in LLMwiki, AGENTS, Skills, Hooks, Subagents, or Plugins.
- Before building a production-facing LLM agent, automation, multi-step tool calls, or human approval, create `AGENT_RUNTIME.md`; a one-shot AI draft / summary / classification does not need it.
- Before building RAG, an AI agent, MCP, an eval pipeline, multi-tenant AI SaaS, document intelligence, or an AI system design, read `workflows/ai-system-design.md` and adopt only the gates that fit the current project.
- When a decision has conflicting evidence, is high-impact or hard to reverse, has several credible routes, or the user explicitly asks for multi-perspective research, read `workflows/research-synthesis.md` first; propose only, and create `RESEARCH_SYNTHESIS.md` only after the user confirms.
- When the user describes "we are at this stage, delivering to this audience, producing this kind of package", read `workflows/stage-routing.md` first and route by stage.

## Report Format Before Starting Work

After reading this folder, the agent reports first:

```md
Read:
- <file 1>
- <file 2>

Initial assessment for this project:
- Fixed documents:
- Conditional documents:
- Skills / tools likely to be used:
- Document-structure routing that may be needed:
- Product shape / technology route mode: user-declared route / ai-recommended route
- Whether AGENT_RUNTIME.md is needed:
- Whether RAG_DESIGN.md / EVAL_PLAN.md / AI_SECURITY_REVIEW.md are needed:
- Why code cannot start yet:
```

## Questioning Principles

- Ask one question at a time.
- The question must affect the MVP, data model, acceptance, risk, or deployment.
- When an answer is vague, follow up with a yes/no or a two-way choice.
- Once the documents are complete, wait for the user to say "confirmed" before moving to the plan.
