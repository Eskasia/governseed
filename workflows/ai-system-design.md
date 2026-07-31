# AI System Design Workflow

Applies to: RAG, knowledge-base Q&A, AI agents, MCP, eval pipelines, multi-tenant AI SaaS, document intelligence, coding agents, tool-use agents, or any AI feature heading into production / preview / a customer trial.

Does not apply to: a one-shot summary, a one-shot classification, internal manual research, or a throwaway prompt draft; `TASK_CONTRACT.md` plus an ordinary smoke check is enough for those.

## How To Use This

This document is LLMwiki's distillation of `ombharatiya/ai-system-design-guide`. It is a checklist, not a fixed process; model prices, benchmarks, provider capabilities, API behavior, and tool versions must be looked up live.

## Routing Before Starting

| Type | Must read | Must produce |
|---|---|---|
| RAG / knowledge-base Q&A | `startup/02-required-project-docs.md`, this document | `RAG_DESIGN.md`, `EVAL_PLAN.md` |
| Agent / MCP / tool-use | `workflows/production-agent.md`, this document | `AGENT_RUNTIME.md`, `EVAL_PLAN.md`, and `AI_SECURITY_REVIEW.md` if needed |
| Multi-tenant AI SaaS | `workflows/fullstack.md`, this document | `DATA_MODEL.md`, `API_CONTRACT.md`, `AI_SECURITY_REVIEW.md` |
| Document intelligence / OCR / extraction | This document, and `workflows/fullstack.md` if needed | `EVAL_PLAN.md`, the data schema, extraction error samples |
| AI going live / preview | `workflows/validation-release.md`, this document | `EVAL_PLAN.md`, a rollback / kill switch record |

## RAG Gate

- Ingestion: sources, formats, update frequency, failure retries, deduplication.
- Chunking: split rules, metadata, parent-child or section relationships.
- Retrieval: vector / keyword / hybrid, rerank, top-k, citation anchors.
- Permission: tenant, role, and document ACL must be filtered before retrieval.
- Answering: cited sources, unanswerable conditions, low-confidence fallback.
- Evaluation: retrieval recall, faithfulness, answer relevance, citation correctness.
- Monitoring: query samples, missed retrieval, hallucination, cost, latency, data drift.

## Agent / MCP Gate

- State: where working / episodic / semantic memory is stored, plus TTL, provenance, and conflict handling.
- Tools: schema, least privilege, side effects, idempotency, rollback, timeout.
- MCP: treat it only as the agent-to-tool boundary; do not mix agent-to-agent coordination into the same layer.
- Human approval: payments, deletion, permissions, external publishing, data migration, and customer-visible behavior must ask a person.
- Sandbox: shell, browser, filesystem, network, and credential access all need boundaries.
- Audit: track only the approved prompt-template version, stable tool / decision / check IDs, relative paths, and aggregate metadata; do not keep raw inputs or outputs.
- Kill switch: able to stop background loops, external actions, and dangerous tools.

## Eval / Observability Gate

- Golden set: covers at least the happy path, permission errors, missing data, ambiguous requests, and malicious input.
- Error taxonomy: classify failures as retrieval, reasoning, tool, permission, format, latency, or cost.
- Traces: keep the approved prompt-template version and privacy-safe trace metadata; never keep private prompts, masked excerpts, raw model stdout/stderr, raw tool traces, environment variables, absolute home paths, or raw diff hunks.
- LLM-as-judge: only as a supporting evaluation; calibrate it with a manual sample or a deterministic metric.
- Regression gate: run it on every change to a prompt, retriever, tool schema, model, or chunking.
- Online monitoring: quality, cost, latency, fallback, rate limit, user corrections.
- Evidence persistence: run closed-schema validation and a fail-closed privacy scan first; store normalized evidence only after cleanup is proven complete. When the scanner or cleanup is uncertain, return a stable code only and leave no artifact.
- Real mode: governance-impact accepts only clean, committed synthetic scenarios; runtime proof accepts only generated synthetic fixtures.
- Claim boundary: runtime proof only verifies the entrypoint first-response contract; the governance-impact evaluator assesses the delivery artifact after intake is complete, and does not claim to measure Q1-Q9 interview quality.
- Runtime capability: the Codex governance-impact real adapter returns `SESSION_SAFETY_UNAVAILABLE` because detached / re-parented descendant containment is unproven; Claude is refused because workspace containment is unproven; Antigravity is unavailable when the binary is missing, and even once a binary exists it must still prove non-persistence and containment first.

## Security Gate

- Prompt injection: external content must not override the system / developer / tool policy.
- Data leakage: PII, tenant data, secrets, and internal notes must not enter context unnecessarily.
- Output handling: LLM output must never directly execute shell, SQL, HTML, payment, or delete.
- Access control: verify the user's and the data's permissions before retrieval or a tool call.
- Key lifecycle: API keys, OAuth tokens, and webhook secrets have an owner, rotation, and revocation.
- Compliance: high-risk domains such as healthcare, finance, legal, HR, and children's data need human review.

## MLOps / Release Gate

- Provider: primary, fallback, rate limit, timeout, budget alert.
- Cost: prompt caching, semantic cache, max tokens, batching, or a degradation strategy.
- Deployment: canary, shadow, manual rollback, feature flag.
- Failure recovery: retry, circuit breaker, graceful degradation, manual escalation.
- Documentation: write the actual choices back into `AGENT_RUNTIME.md`, `RAG_DESIGN.md`, `EVAL_PLAN.md`, or `AI_SECURITY_REVIEW.md`.

## What Does Not Enter The Runtime

- Named model rankings, prices, benchmarks, or version conclusions.
- One article's tool preferences.
- Unverified agent framework claims.
- A new rule that has not passed a smoke or held-out task.
