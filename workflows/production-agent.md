# Production Agent Workflow

Applies to: an LLM agent inside a product, automation, multi-step tool calls, human approval, background tasks, Slack/Gmail/webhook triggers, or any feature where the AI acts on the user's behalf.

Does not apply to: a one-shot AI draft, summary, or classification, or research assistance run by hand locally; verify those with an ordinary `TASK_CONTRACT.md` and tests first.

If it also involves RAG, MCP, long-term memory, an eval pipeline, multi-tenant data, document intelligence, or provider fallback, read `workflows/ai-system-design.md` as well.

## Core Principle

A reliable agent is not "a prompt plus a bag of tools plus a loop until done". A reliable agent is an observable, pausable, resumable, verifiable software flow in which the LLM handles only the steps that need language understanding or fuzzy judgment.

## Documents To Add

When building a production-facing agent, create `AGENT_RUNTIME.md`.

Required fields:

- Agent goal: for whom, and what work it completes.
- Trigger entry: UI, cron, webhook, Slack, Gmail, CLI, manual.
- State: business state, execution state, where it is stored, whether it can be rebuilt from events.
- Event: which events advance the agent.
- Context window: the format, sources, and compaction for what the model receives each time, plus what must never go in.
- Prompts: where the prompt template lives, the approved version, who may change it. Traces record only the version and privacy-safe metadata, never the private runtime prompt.
- Structured outputs: the only JSON / schema / action types the model may emit.
- Tools: each tool's permissions, side effects, idempotency, rollback.
- Control flow: which parts the program controls and which are left to the model's judgment.
- Human approval: when a person must be asked, who approves, what happens on timeout.
- Launch / pause / resume: how to start, pause, resume, retry, cancel.
- Error compaction: how an error is compacted before returning to context, instead of pushing a whole block of noise back to the model.
- Verifier: tests, eval, benchmark, replay, E2E, manual sampling.
- Agent boundary: whether the task is small and focused, and whether the expected step count stays within 3-10.
- Stateless reducer: whether it can be described as `state + event -> next action`.
- Audit / observability: how to look up stable tool / decision / check IDs, aggregate cost / latency, and failure codes; raw tool traces, model stdout/stderr, environment variables, and raw diffs are not stored.
- Kill switch: how to immediately disable background tasks, external actions, or high-risk tools.

## 12 Factor Gate

Answer each before implementation:

| Factor | Check |
|---|---|
| Natural language to tool calls | Does the model only turn natural language into a structured action? |
| Own prompts | Are the approved prompt template and version reviewable in the repo / docs, with the private runtime prompt never written to disk? |
| Own context window | Is the context format ours to design, testable, and compactable? |
| Tools are structured outputs | Is a tool call just JSON, with side effects controlled by the program? |
| Unify state | Is execution state kept as close to business state as possible? |
| Launch / pause / resume | Can it start, pause, resume, retry, and cancel? |
| Contact humans | Is asking a person a first-class tool/action rather than an ad hoc exception? |
| Own control flow | Does the program own the important flow instead of handing it to an unbounded loop? |
| Compact errors | Are errors turned into short, useful context? |
| Small focused agents | Is the agent small and focused, avoiding a huge general-purpose task? |
| Trigger anywhere | Are the users' real entry points defined, not just chat? |
| Stateless reducer | Can the next step be derived from state + event? |

## Governance Evidence Boundary

- Real mode is synthetic-only: governance-impact runs only clean, committed synthetic scenarios; runtime proof runs only generated synthetic fixtures.
- Raw buffers may only be scanned and parsed in bounded memory; private prompts, masked excerpts, raw stdout/stderr, raw tool traces, environment variables, credentials, absolute home paths, and raw diff hunks must never be persisted.
- Store normalized evidence atomically only after closed-schema validation, the fail-closed privacy scan, and the cleanup proof all pass.
- When the scanner, session persistence, output schema, or cleanup cannot be proven safe, return a stable code and produce no artifact; do not degrade to a weaker mode.
- Runtime proof only proves the entrypoint first-response contract; only the governance-impact evaluator assesses the post-intake delivery artifact, and it must pass an independent evidence gate before it can support an effectiveness claim.
- A Codex evaluator real run is refused because detached / re-parented descendant containment is unproven; Claude is refused because workspace containment is unproven; Antigravity is unavailable when the binary is missing, and even with a binary stays refused until both non-persistence and containment are proven.

## Implementation Order

1. Start with a deterministic thin slice: fixed input, fixed action, fixed verifier.
2. Then add structured output: the model only emits an action and never executes a side effect directly.
3. Then add tools: write out each tool's permissions, side effects, idempotency, and rollback.
4. Then add state: state is queryable, replayable, recoverable.
5. Then add human approval: high-risk actions must ask a person first.
6. Only then build automation / background loops.

## Do Not Start With

- Do not wire up a large bag of tools first.
- Do not hand control flow to a framework black box.
- Do not let the model perform side-effecting operations directly.
- Do not push a full stack trace back into context verbatim.
- Do not start a long task or background automation without a verifier.
- Do not build one agent into a general-purpose role that does everything.

## Acceptance

- `AGENT_RUNTIME.md` is complete.
- Every tool has a schema, permissions, side effects, idempotency, and rollback.
- Every high-risk action has human approval.
- Every error has a compact format.
- There is at least one replay / eval / E2E / smoke that proves the agent has not gone off track.
- It can pause, resume, retry, or cancel.
- The current state, the next event, and the next action can all be explained.
- Traces record only the approved prompt-template version and privacy-safe metadata, and what is persisted conforms to the normalized closed schema.
- Real-mode synthetic-only, scanner fail-closed, cleanup-before-persist, and the claim boundary each have an executable verifier.
