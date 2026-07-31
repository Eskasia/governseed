# Validation And Release

## Verify Every Step

- It starts locally without crashing.
- The change matches TASK_CONTRACT.
- No unexpected edits outside this step's scope.
- If there are tests, run them; on failure record only a stable code, reproducible steps, and privacy-safe normalized error metadata, never persisted raw model / tool output.
- If there is UI, use Browser/Chrome to check desktop/mobile, the console, and the core flow.
- If there is a screenshot, generated UI, or design spec, take a Browser/Chrome screenshot and do a side-by-side critique.
- If there is a DB, verify the migration, RLS, and seed/mock data.

## Pre-launch Checks

- `npm test` / `pnpm test` / the repo's designated tests.
- `npm run lint` / `pnpm lint`.
- `npm run build` / `pnpm build`.
- Playwright smoke passes 100%.
- The preview URL opens and the core path works.
- The preview/production env in ENV_CHECKLIST is confirmed.

## UI / App Building Acceptance

Only applies when `UI_SPEC.md`, `DESIGN_SYSTEM.md`, or `DESIGN_REVIEW.md` exists:

- The visual target is saved or traceable: screenshot, wireframe, generated UI, Figma, Open Design, or an HTML prototype.
- Browser/Chrome screenshots have checked desktop/mobile.
- The side-by-side critique lists the differences in layout, spacing, typography, color, assets, interaction, and data realism.
- The loading, empty, error, disabled, focus, and hover/tap states are covered.
- Demo data is labeled; real data has its source recorded.
- No text overflows, overlaps, or is obscured.
- The result is not just a static mockup; the core flow works.

## Agent Pre-launch Checks

Only applies when `AGENT_RUNTIME.md` exists:

- The approved prompt-template version, context window schema, and structured outputs are reviewable in the repo / docs; private runtime prompts are never written to disk.
- Every tool has permissions, side effects, idempotency, and rollback.
- High-risk actions have human approval.
- Launch, pause, resume, retry, and cancel are supported.
- Errors are compacted before returning to context, not dumped in as full noise.
- There is at least a replay / eval / E2E / smoke verifier.
- The current flow can be explained as `state + event -> next action`.

## AI System Pre-launch Checks

Only applies when `RAG_DESIGN.md`, `EVAL_PLAN.md`, or `AI_SECURITY_REVIEW.md` exists:

- RAG: ingestion, chunking, retrieval, rerank, citation, permission filter, and fallback are all recorded.
- Agent / MCP: tool permissions, sandbox, audit log, HITL, retry, and kill switch are all recorded.
- Eval: golden set, error taxonomy, privacy-safe trace metadata, quality / cost metrics, and the regression gate are all recorded.
- Security: prompt injection, data leakage, tenant isolation, output handling, and API key lifecycle are all recorded.
- MLOps: provider fallback, rate limit, budget alert, canary, and rollback or a manual disable path are all recorded.

## Governance Evidence Claim Gate

- Runtime proof may only claim that the generated entrypoint passes the minimal first-response contract; neither the mock nor the real smoke is a model benchmark, and neither proves governance effectiveness.
- The governance-impact evaluator only assesses the delivery artifact after intake is complete; it does not claim to test Q1-Q9 interview quality. A public effectiveness claim must separately pass the real paired-run evidence gate.
- Real mode is synthetic-only: the evaluator accepts only clean, committed synthetic scenarios; runtime proof uses only generated synthetic fixtures, and private / customer / production content is forbidden.
- Raw stdout/stderr, raw tool traces, environment variables, private prompts, masked excerpts, absolute home paths, and raw diff hunks must not be persisted; only normalized closed-schema evidence that passed the validator and the privacy scanner may be stored.
- When the privacy scanner, session safety, output schema, or cleanup cannot be proven, fail closed: exit with a stable code and leave no artifact. Cleanup must happen before persistence.
- The Codex governance-impact real adapter returns `SESSION_SAFETY_UNAVAILABLE` because detached / re-parented descendant containment is unproven. Claude is refused because workspace containment is unproven; Antigravity is `RUNTIME_MISSING` when the binary is absent, and even once a binary exists it stays refused until non-persistence and containment are proven.

## Security Reinforcement

- `projectdiscovery/nuclei` is used only against local/preview/production URLs you own or are authorized to test.
- The first release only does a security smoke: exposed debug routes, common headers, public buckets, error-page leakage, default passwords, unprotected admin.
- Real penetration testing is a separate task, not mixed into MVP implementation.

## Wrap-up

- Use the `handoff` skill to record the state and the next step.
- Use the `neat-freak` skill to sync docs.
- Use `repomix --compress` for an overall review or handoff.
- After a milestone, do architecture hygiene: are the modules deeper, are the interfaces narrower, do the names fit the domain better, is `zoom-out` or `improve-codebase-architecture` needed.
- Write reusable lessons back to LLMwiki.
- Use `workflows/agent-file-structure.md` to decide whether to update `AGENTS.md`, add to `Skills/`, add a `Hooks/` entry, create a `Subagents/` role, or promote to `Plugins/`.
- If `AGENT_RUNTIME.md` exists, sync the actual state, tools, approvals, and verifiers.
- If there are AI system documents, sync the actual RAG, eval, security, observability, and rollback state.
