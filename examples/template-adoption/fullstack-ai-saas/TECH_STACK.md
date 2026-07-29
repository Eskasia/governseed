# TECH_STACK.md

## 技術路線決策

- 決策模式：ai-recommended route
- 唯一主路線：TypeScript fullstack AI web app on Next.js, Supabase Postgres, and Vercel preview
- 選擇理由：前後端共享 TypeScript 型別，web preview 讓 owner 可直接驗收，Supabase RLS 適合客戶文件權限，Vercel preview 支撐快速迭代。
- 排除路線：不採 native app、小程序、純 API、desktop app，因為第一版需要可分享 web preview、上傳文件、登入、資料表與 citation UI。
- 後期風險：RAG 成本、tenant 權限、citation 正確性、provider API 行為變化會影響維護。
- 重評估條件：需要離線、原生檔案權限、API-only 客戶整合、或資料量超出 Supabase preview 能力時重新評估。
- 新技術引入 gate：新增 AI SDK、vector DB、reranker、queue 或 auth provider 前，必須更新 TECH_STACK、RAG_DESIGN、EVAL_PLAN 或 AI_SECURITY_REVIEW。
- Decision status：active
- Evidence：SRC-101, SRC-102, REQ-101@1, REQ-102@1
- Nearest alternative：separate API-only RAG service
- Review trigger：event-only when acceptance becomes API-only, offline, or exceeds the selected preview scale

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
