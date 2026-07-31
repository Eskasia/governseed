# 01 Bootstrap Gates

## Main Flow

Every new project follows the same sequence:

1. Spec: Q1-Q9, follow-up questions, PROJECT_BRIEF, SPEC, CONTEXT
2. Conditional research: when a material research signal appears, propose `RESEARCH_SYNTHESIS.md` and run it only after the user confirms
3. Route: the product shape / technology route gate, TECH_STACK, any required ADR
4. Design: TASK_CONTRACT, AGENTS, any required conditional documents
5. Conditional documents: UI, fullstack, environment, API, data model, agent runtime
6. Plan: 5-10 steps, each with a verification
7. Implementation: one step at a time
8. Verification: tests, Browser/Chrome, Playwright, DB, deployment checks
9. Wrap-up: handoff, neat-freak, repomix, a gstack-style checklist

## Q1-Q9

Q1-Q9 exist to establish the requirements, constraints, acceptance, deployment, and technology preferences that the later product-shape and technology-route decisions rest on. They do not require the user to understand the technology up front.

Q1. Whose problem does this solve, and what problem? One sentence, no "and".  
Q2. What does success look like for the first release? Describe it as observable behavior.  
Q3. What would tell you this was built wrong?  
Q4. What is explicitly out of scope for the first release? At least three things.  
Q5. Is there an existing system, framework, or API that cannot be changed?  
Q6. Who accepts the work, and how? Clicking through it, running tests, handing it to someone else.  
Q7. Where does it deploy? Local, preview, production.  
Q8. Is there a technology or tool already decided on?  
Q9. Are there hard performance or scale requirements?

### Conditional Research Candidate Detection

This is not a Q10. Once Q1-Q9 is enough to state the decision problem, read `workflows/research-synthesis.md` first if there is an evidence conflict, a high-impact or hard-to-reverse decision, several credible routes that would materially change scope, acceptance, risk, cost, or route — or if the user explicitly asks for multi-perspective research.

- The agent reports only the trigger reason code, the affected decision, and the risk of not running it.
- Ask one question only: whether to create `RESEARCH_SYNTHESIS.md`.
- Run it only after the user confirms; on refusal, do not create an empty document.
- Neither the detection, the proposal, nor the document's existence is a new hard gate.
- An empty template pre-placed by `--all` does not count as confirmation; the `Activation Record` must record `User decision: confirmed` or `User decision: declined` explicitly, and only the former starts the research.

## Product Shape / Technology Route Gate

The generated `AGENTS.md` is the only place that defines the owner, status, evidence, event-only review trigger, and fallback for `GATE-INTENT-001` and `GATE-ROUTE-001`; this document only describes the bootstrap method. After Q1-Q9, read `workflows/product-shape-tech-route.md` and record one route in the documents:

- `user-declared route`: the user has specified the product shape or technology stack; the agent checks it against Q1-Q9 and fills in the missing layers and risks.
- `ai-recommended route`: the user does not know the technology route; the agent recommends one first-release product shape and one primary technology route from Q1-Q9.

Done criteria:

- `PROJECT_BRIEF.md` states the product shape decision, the decision mode, the Q1-Q9 basis, and the shapes that were excluded.
- `TECH_STACK.md` states the primary route, frontend, backend, database, main framework / SDK, and deployment; where a layer does not apply, fill `n/a` and say why.
- `TECH_STACK.md` states which technology routes were rejected, the late-stage risks, the re-evaluation triggers, and the new technology gate.
- An expensive or hard-to-reverse route choice is written into `docs/adr/*.md`; a route question that cannot be settled goes into `OPEN_LOOPS.md`, then return to `AGENTS.md` and apply `GATE-ROUTE-001`.

## Conditions To Proceed

- `GATE-INTENT-001` and `GATE-ROUTE-001` have been evaluated per the generated `AGENTS.md`.
- Every acceptance criterion in SPEC is yes/no.
- Every task in TASK_CONTRACT has a verification method.
- OPEN_LOOPS explicitly lists what is still undecided.
- If the project includes a production-facing LLM agent / automation / tool use, `AGENT_RUNTIME.md` is complete.
- If the user confirmed conditional research, `RESEARCH_SYNTHESIS.md` is complete and the affected canonical project decision still requires user confirmation; if research was not confirmed or was declined, this document is not required.
- Only when a durable rule is proposed, record the selected destination, canonical owner, and evidence; with no proposal, do not run the document-structure routing.
- The user explicitly says "confirmed".
