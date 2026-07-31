# Product Shape and Tech Route Workflow

Applies when: a new project has finished Q1-Q9 and, before any code, must decide whether the first release is a website, a mini program, an app, a pure backend API, an admin system, an agent service, or some other main shape.

This workflow only supplies the decision method. The owner, status, evidence, event-only review trigger, and fallback for `GATE-ROUTE-001` are always read from the generated `AGENTS.md`; this file does not copy those lifecycle fields.

## Core Principles

- Q1-Q9 collects constraints; it does not require the user to understand the technology first.
- Each project's first release has exactly one main product shape and one main technology route.
- Fixed templates hold only shared governance rules; specific frameworks, SDKs, and deployment platforms belong in project documents, fixtures, or conditional workflows.
- Follow ECC's layering approach: shared rules in the core layer, platform or tool differences in the adapter layer. Pick one adoption or installation route at a time; do not stack them.

## Decision Modes

| Mode | When to use | Agent responsibility |
|---|---|---|
| `user-declared route` | The user has already specified the product shape, technology stack, platform, framework, or an existing system that cannot change | Record the user's route; check it against Q1-Q9 for conflicts; fill in the frontend, backend, database, SDK, deployment, risks, and re-evaluation triggers |
| `ai-recommended route` | The user is new to this, does not know what routes exist, or has only described the problem and the usage scenario | Recommend exactly one product shape and one technology route from Q1-Q9; explain why the other routes were excluded |

## How Q1-Q9 Maps To The Route

| Question | Effect on the route |
|---|---|
| Q1 users and problem | Whether the product is a human-facing UI, a system-to-system API, or an agent / automation |
| Q2 what success looks like | Whether the first release needs an operable product, a demo, an internal tool, or server-side capability |
| Q3 failure conditions | Rules out unsuitable complexity, platforms, and data flows |
| Q4 explicitly out of scope | Keeps the first release from doing multiple platforms or runtimes at once |
| Q5 systems / frameworks / APIs that cannot change | The strongest constraint on the stack and the adapter boundary |
| Q6 acceptance method | Determines whether Browser, a device, API tests, a DB check, or a manual tester handoff is needed |
| Q7 deployment target | Determines local, preview, production, desktop package, or backend service |
| Q8 technology or tools already decided | Enters `user-declared route`, or is recorded as a candidate constraint |
| Q9 performance or scale | Determines whether a database, queue, cache, native app, or backend API is needed, or whether the MVP should be simplified |

## Product Shape Candidates

| Shape | Fits when | Common reason to exclude |
|---|---|---|
| Website / landing page | Mostly display, content, sign-ups, documentation, or a single interaction | Needs repeated logged-in operation, complex data state, or an internal workflow |
| Web app / admin system | Needs login, data tables, workflows, dashboards, repeated operation | Only public display is needed, or native mobile capability is required |
| Mobile / desktop app | Needs device permissions, offline, local files, TCC, native UX | The first release only needs the data flow validated, or a web preview will do |
| Mini program | Users are mostly on one platform's entry point, and the platform's limits are part of the product requirement | Cross-platform or the open web is needed, or platform review would slow the first release |
| Pure backend API | The users are other systems, or the frontend already exists and only a server-side contract is needed | A human must use it directly, or the core flow must be accepted by hand |
| Agent service / automation | AI acts on the user's behalf, calls tools, runs background tasks, or needs approval | It is only a one-shot summary, classification, draft, or manual research |

## Evaluation Criteria

Always compare routes on:

- Product shape fit: does it directly support Q1-Q2.
- Project complexity: does it avoid doing multiple platforms, runtimes, or providers in the first release.
- AI-friendliness: are the documents, tests, directories, and responsibility boundaries easy for an agent to maintain.
- Clear boundaries: are the frontend, backend, database, SDK, external services, and adapters cleanly separated.
- Maintainability: are later debugging, testing, upgrades, and rollback traceable.
- Iterability: can the first release be validated as a thin slice and expanded afterwards.

## Required Output

- `PROJECT_BRIEF.md`: the product shape decision, the decision mode, the Q1-Q9 basis, and the shapes that were excluded.
- `TECH_STACK.md`: the single primary technology route, frontend, backend, database, main framework / SDK, deployment, excluded routes, risks, re-evaluation triggers, and the new technology gate.
- `docs/adr/*.md`: expensive or hard-to-reverse route decisions.
- `OPEN_LOOPS.md`: route questions that still cannot be settled; for what happens next, return to the generated `AGENTS.md` and read the current lifecycle fields of `GATE-ROUTE-001`.

## New Technology Gate

Before adding any framework, SDK, provider, database, queue, agent framework, MCP server, or native wrapper, answer:

- Does it match the single primary route in `TECH_STACK.md`?
- Does it solve a problem the first release's acceptance actually needs?
- Does it break the frontend, backend, database, or adapter boundary?
- Does it turn the project from one route into a stack of runtimes?
- Does an ADR need to be added or updated?

## Lifecycle Reference

When to review, and what fallback applies when the gate fails, are governed by the current `GATE-ROUTE-001` row in the generated `AGENTS.md`; this workflow does not maintain a separate event or handling list.
