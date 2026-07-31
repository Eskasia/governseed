# TECH_STACK.md

## Technology route decision

- Decision mode: ai-recommended route
- Primary route: TypeScript fullstack AI web app on Next.js, Supabase Postgres, and Vercel preview
- Rationale: frontend and backend share TypeScript types, a web preview lets the owner accept the work directly, Supabase RLS fits client-document permissions, and Vercel previews support fast iteration.
- Excluded routes: no native app, mini program, API-only service, or desktop app, because the first release needs a shareable web preview, document upload, login, tables, and a citation UI.
- Late-stage risks: RAG cost, tenant permissions, citation correctness, and provider API behavior changes all affect maintenance.
- Re-evaluation triggers: re-evaluate when offline use, native file permissions, API-only client integration, or a data volume beyond Supabase preview capacity is needed.
- New technology gate: before adding an AI SDK, vector DB, reranker, queue, or auth provider, update TECH_STACK, RAG_DESIGN, EVAL_PLAN, or AI_SECURITY_REVIEW.
- Decision status: active
- Evidence: SRC-101, SRC-102, REQ-101@1, REQ-102@1
- Nearest alternative: separate API-only RAG service
- Review trigger: event-only when acceptance becomes API-only, offline, or exceeds the selected preview scale

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Next.js | pinned in repo | Preview deployment path and citation UI | Native app |
| Backend | Next.js route handlers / server actions | pinned in repo | Keeps first-version API boundary close to UI | Separate FastAPI service |
| Package manager | pnpm | pinned in repo | Existing local default | npm |
| Database | Supabase Postgres | current cloud version | RLS and auth fit | SQLite |
| Main framework / SDK | OpenAI SDK | current verified version | Embeddings and answer generation | Local model runtime |
| Deployment | Vercel preview | current platform | Shareable preview URL | local only |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| OpenAI | embeddings / answering | `OPENAI_API_KEY` | owner |

## Version Policy

- Verify current API behavior before model or SDK changes.

## Constraints

- No tenant data in unnecessary model context.
