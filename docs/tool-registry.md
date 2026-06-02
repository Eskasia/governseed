# Tool Registry

本檔只記錄 `workflows/tool-routing.md` 會提到的工具可用性；routing 決策仍以 `workflows/tool-routing.md` 為準。

## Availability Labels

| Label | Meaning |
|---|---|
| repo doc | 本 repo 內建 markdown workflow，可直接讀 |
| builtin/runtime | 常見 agent runtime 或專案依賴可能提供，仍需以當前環境確認 |
| external skill | 需要使用者或 runtime 安裝對應 skill |
| external CLI | 需要本機安裝 CLI |
| external reference | 只作公開來源或結構參考，不安裝、不觸發 |
| private/local | 使用者本機知識庫或私有工作流，不可假設公開使用者有 |
| experimental | 已記錄但未納入預設流程 |
| not adopted | 明確不納入 starter 路由 |

## Registry

| Tool / Skill | Label | Primary use | Fallback |
|---|---|---|---|
| `workflows/agent-file-structure.md` | repo doc | 判斷經驗、規則、技能該寫到哪裡 | `OPEN_LOOPS.md` |
| `workflows/ai-system-design.md` | repo doc | RAG、AI agent、MCP、eval、AI 系統設計 gate | conditional docs |
| `workflows/design-system-from-screenshots.md` | repo doc | 從截圖整理 design system | `DESIGN_SYSTEM.md` |
| `workflows/macos-build-release.md` | repo doc | macOS build、簽名、TCC、notarization | 專案內 build script |
| `workflows/presentation.md` | repo doc | slide deck、一頁紙、簡報 artifact | Markdown / HTML slides |
| `workflows/production-agent.md` | repo doc | production-facing LLM agent、tool use | `AGENT_RUNTIME.md` |
| `workflows/skill-and-plugin-adoption.md` | repo doc | 外部 repo、skill、plugin、agent pack 採用 gate | `TECH_STACK.md` / ADR / `OPEN_LOOPS.md` |
| `workflows/ui-ux.md` | repo doc | UI spec、review、polish routing | `UI_SPEC.md` |
| `docs/experiments/context-mode.md` | experimental | context 壓力緩解實驗 | handoff note |
| CodeGraph | builtin/runtime | 已有 `.codegraph/` 時查 symbol、call graph、impact | `rg`、讀檔、測試 |
| Understand-Anything | external skill | 大型陌生 repo / knowledge graph onboarding | `zoom-out` + local notes |
| Playwright | builtin/runtime | 本機或 preview web UI 自動化測試 | Browser / Chrome manual QA |
| `webapp-testing` | external skill | web UI / Playwright 驗證、截圖、console log；source: `anthropics/skills` | Browser / Chrome manual QA |
| `code-reviewer` | external skill | 通用 code review / PR review workflow 參考；source: `google-gemini/gemini-cli` | 本 repo review stance + project tests |
| `pr-creator` | external skill | 使用者明確要求建立 PR；source: `google-gemini/gemini-cli` | 手動 `gh pr create`，先跑驗證 |
| `update-docs` | external reference | docs impact / docs sync workflow；source: `vercel/next.js` | 手動更新 docs / `OPEN_LOOPS.md` |
| `cache-components` / `next-cache-components` | external skill | 僅在 `TECH_STACK.md` 明確選 Next.js 且 `next.config.*` 啟用 `cacheComponents: true`；sources: `vercel/next.js`, `vercel-labs/next-skills` | 一般 Next.js / React docs 與 project tests |
| `frontend-code-review` | external reference | 參考 rule catalog + references 結構；source: `langgenius/dify` | 專案自有 review checklist |
| `fullstack-developer` | not adopted | 不納入：預設 React / Next.js / Node / Prisma 等路線，會破壞技術路線 gate；source: `Shubhamsaboo/awesome-llm-apps` | `workflows/product-shape-tech-route.md` |
| `fix` | not adopted | 不納入：綁定 React repo 的 `yarn prettier` / `yarn linc`，不能作跨專案 bugfix 預設；source: `facebook/react` | `tdd` / `diagnose` / project checks |
| image generation skill | builtin/runtime | 產生參考圖或素材 | image search / 手動素材 |
| `grill-with-docs` | external skill | 需求問診與 shared language | `PROJECT_BRIEF.md` / `SPEC.md` |
| `tdd` | external skill | red-green-refactor | focused smoke check |
| `diagnose` | external skill | 系統化 debug | reproduce / minimise / hypothesise / instrument / fix |
| `zoom-out` | external skill | repo / module onboarding | `rg` + local notes |
| `prototype` | external skill | 正式 UI 實作前原型驗證 | static HTML demo |
| `neat-freak` | external skill | 收尾同步文件與 open loops | manual handoff |
| `handoff` | external skill | 跨 thread / 隔天接續 | continuation markdown |
| `academic-research` | external skill | 論文、文獻、citation | manual citation table |
| `design-taste-frontend` | external skill | UI anti-slop polish | `DESIGN_REVIEW.md` |
| `redesign-existing-projects` | external skill | 既有 UI hierarchy / spacing 重設 | focused CSS changes |
| `vercel-deploy` | external skill | Vercel deployment workflow | Vercel CLI / dashboard |
| `pdf` | external skill | PDF 讀寫與版面檢查 | local PDF library |
| `kami` | external skill | 一頁紙、白皮書、履歷、作品集 | Markdown / HTML artifact |
| `skill-creator` / `skill-installer` | external skill | 建立或安裝可重複 skills | manual docs / scripts |
| `find-skills` | external skill | 搜尋 skill 候選；source: `vercel-labs/skills` | manual search；候選仍走 adoption gate |
| `to-prd` / `to-issues` / `triage` | external skill | PRD、issue、triage | `TASK_CONTRACT.md` |
| `audit-prep-assistant` / `semgrep` / `codeql` | external skill | 安全審查、靜態分析、依賴風險 | threat checklist / package audit |
| RTK | external CLI | 壓縮大型 shell 輸出 | 原生命令加範圍限制 |
| Its Hover | external CLI | React/shadcn micro-interaction package | CSS transition |
| repomix | external CLI | 里程碑 review / handoff bundle | manual file list |
| LLMwiki | private/local | 使用者本機跨專案知識庫 | project docs |
| gstack-style checklist | external reference | product / architecture / design / review / QA / security / release / retro checklist thinking | `workflows/validation-release.md` |
