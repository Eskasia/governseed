# Fullstack SaaS Workflow

適用：已在 `PROJECT_BRIEF.md` / `TECH_STACK.md` 選定全端 SaaS 或 web app 路線後，才使用 Next.js、TypeScript、Tailwind、shadcn/ui、Supabase、OpenAI API、Playwright、Vercel preview 這類全端專案檢查清單。

## 必補文件

- `DATA_MODEL.md`：tenant、user/staff、role、核心資料表、RLS、seed/mock data、資料保留策略。
- `API_CONTRACT.md`：route/server action/webhook、request、response、error shape、權限、idempotency。
- `ENV_CHECKLIST.md`：本機、preview、production 需要的 env、金鑰來源、不可提交項、provider setup。

## 實作順序

1. 先做可本機驗證的薄切片：登入、建立一筆資料、reload 後仍存在。
2. 再補 API / DB 邊界：schema、RLS、migration、seed、mock adapter。
3. 再做 UI 狀態：loading、empty、error、disabled、permission denied。
4. 最後才做外部 provider：正式 OAuth、付款、Email、真實 webhook。

## 不要一開始就做

- 不要先做完整 CRM、billing、multi-tenant admin、正式多渠道串接。
- 不要把 provider setup 當成本機 MVP 的 blocker。
- 不要在沒有 RLS / 權限文件時直接改資料庫安全規則。

## 驗證

- local smoke：啟動、登入、建立資料、reload、查 DB。
- e2e smoke：Playwright 跑核心流程。
- preview smoke：Vercel preview + remote env 檢查。
- performance smoke：核心頁 p95 目標寫入 SPEC。
