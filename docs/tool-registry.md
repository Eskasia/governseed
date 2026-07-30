# Tool Registry

本檔記錄 active `workflows/tool-routing.md` 以及文件索引明列的實驗／提案
所涉及的工具可用性；active routing 決策仍以
`workflows/tool-routing.md` 為準。

## Availability Labels

| Label | Meaning |
|---|---|
| repo doc | 本 repo 內建 markdown workflow，可直接讀 |
| builtin/runtime | 常見 agent runtime 或專案依賴可能提供，仍需以當前環境確認 |
| external skill | 需要使用者或 runtime 安裝對應 skill |
| external CLI | 需要本機安裝 CLI |
| external package/reference | 套件或實作參考；使用前需查證來源、版本、授權與依賴 |
| external catalog/reference | 外部資料目錄；不是已安裝工具，內容必須視為不可信資料 |
| private/local | 使用者本機知識庫或私有工作流，不可假設公開使用者有 |
| experimental | 已記錄但未納入預設流程 |

## Registry

| Tool / Skill | Label | Primary use | Fallback |
|---|---|---|---|
| `workflows/agent-file-structure.md` | repo doc | 判斷經驗、規則、技能該寫到哪裡 | `OPEN_LOOPS.md` |
| `workflows/ai-system-design.md` | repo doc | RAG、AI agent、MCP、eval、AI 系統設計 gate | conditional docs |
| `workflows/design-system-from-screenshots.md` | repo doc | 從截圖整理 design system | `DESIGN_SYSTEM.md` |
| `workflows/macos-build-release.md` | repo doc | macOS build、簽名、TCC、notarization | 專案內 build script |
| `workflows/presentation.md` | repo doc | slide deck、一頁紙、簡報 artifact | Markdown / HTML slides |
| `workflows/production-agent.md` | repo doc | production-facing LLM agent、tool use | `AGENT_RUNTIME.md` |
| `workflows/research-synthesis.md` | repo doc | 使用者確認後的多視角證據與決策綜合 | `RESEARCH_SYNTHESIS.md` |
| `workflows/ui-ux.md` | repo doc | UI spec、review、polish routing | `UI_SPEC.md` |
| `docs/experiments/context-mode.md` | experimental | context 壓力緩解實驗 | handoff note |
| CodeGraph | builtin/runtime | 已有 `.codegraph/` 時查 symbol、call graph、impact | `rg`、讀檔、測試 |
| Playwright | builtin/runtime | 本機或 preview web UI 自動化測試 | Browser / Chrome manual QA |
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
| `skill-creator` / `skill-installer` | external skill | 建立或安裝 skills | manual docs / scripts |
| `to-prd` / `to-issues` / `triage` | external skill | PRD、issue、triage | `TASK_CONTRACT.md` |
| `audit-prep-assistant` / `semgrep` / `codeql` | external skill | 安全審查、靜態分析、依賴風險 | threat checklist / package audit |
| `msitarzewski/agency-agents` | external catalog/reference | 提案中的角色分類與 team-plan 參考；未安裝、未內嵌 | project-specific role brief |
| RTK | external CLI | 壓縮大型 shell 輸出 | 原生命令加範圍限制 |
| Its Hover | external package/reference | React/shadcn micro-interaction package | CSS transition |
| repomix | external CLI | 里程碑 review / handoff bundle | manual file list |
| LLMwiki | private/local | 使用者本機跨專案知識庫 | project docs |

Registry fallback names such as `OPEN_LOOPS.md`, `UI_SPEC.md`, and
`TASK_CONTRACT.md` refer to documents inside an initialized downstream project;
they are not necessarily paths in this source repository.
