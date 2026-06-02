# Tool Routing

工具可用性、安裝狀態與 fallback 見 `docs/tool-registry.md`。本檔只負責「遇到什麼工作，先看哪條路由」。

## 日常選工具

| 情況 | 主要路由 | fallback |
|---|---|---|
| 需求、名詞、邊界不清 | `grill-with-docs` | 先補 `PROJECT_BRIEF.md`、`SPEC.md`、`CONTEXT.md` |
| 新功能、bugfix、狀態流程 | `tdd` 或 smoke check | 手寫最小 regression check |
| bug 原因不明、測試反覆掛 | `diagnose` | reproduce / minimise / hypothesise / instrument / fix |
| 不熟悉既有 repo / 模組、需要先理解系統脈絡 | `zoom-out`；大型陌生 repo 才用 Understand-Anything 建 knowledge graph；若已有 `.codegraph/` 再用 CodeGraph | `rg`、直接讀檔、局部架構筆記 |
| UI 方向、狀態模型、domain flow 不確定，正式實作前要先玩一次 | `prototype` | `UI_SPEC.md` + 靜態 HTML demo |
| 大 repo 查 symbol、route、call graph、impact | CodeGraph，前提是已有 `.codegraph/` 或使用者明確要求建立索引 | `rg`、語言伺服器、測試 |
| 里程碑 review、交接、壓縮上下文 | repomix | `OPEN_LOOPS.md`、handoff markdown |
| 常見命令輸出很大、想壓縮 token：`ls/tree/read/grep/git diff/test/lint/tsc/playwright/docker logs` | RTK：`rtk <command>` | 原生命令加範圍限制 |
| 階段完成或 diff 影響 docs，要同步文件 | `update-docs` pattern；session cleanup 才用 `neat-freak` | 手動更新 docs / `OPEN_LOOPS.md` / handoff |
| 長 thread 或隔天接續 | `handoff` | `OPEN_LOOPS.md` + continuation note |
| 長任務、大輸出、context 快爆、compaction 後接不上 | `docs/experiments/context-mode.md` | 小範圍讀檔與中途 handoff |
| 可跨專案重用的經驗 | LLMwiki | 專案內 docs 或 ad hoc note |
| 不確定規則、經驗、流程該寫到哪裡 | `workflows/agent-file-structure.md` | 保留在 `OPEN_LOOPS.md` |
| 論文、文獻、citation | `academic-research`，只在研究任務啟用 | 手動文獻表與 citation check |
| 本機或 preview web UI 自動化測試 | `webapp-testing` / Playwright | Browser / Chrome manual QA |
| React/shadcn animated icons、hover/tap micro-interaction | Its Hover，依 `workflows/ui-ux.md` 使用 | CSS transition / local component |
| App 截圖 → Design System → 前端初稿 | `workflows/design-system-from-screenshots.md` | `DESIGN_SYSTEM.md` |
| 既有 UI 像模板、視覺普通、需要 anti-slop polish | `design-taste-frontend` | `DESIGN_REVIEW.md` |
| 既有 UI 要重設 hierarchy / spacing / styling | `redesign-existing-projects` | `UI_SPEC.md` + focused CSS changes |
| 只要產生參考圖 | image generation skill | browser image search 或手動素材 |
| Vercel 部署 | `vercel-deploy` | Vercel CLI / dashboard |
| macOS app build、簽名、TCC、DMG、notarization | `workflows/macos-build-release.md` | 專案內 Xcode / build script |
| production-facing LLM agent、多步 tool use | `workflows/production-agent.md` | `AGENT_RUNTIME.md` |
| RAG、AI agent、MCP、eval、AI 系統設計 | `workflows/ai-system-design.md` | `RAG_DESIGN.md` / `EVAL_PLAN.md` / `AI_SECURITY_REVIEW.md` |
| PDF 讀取、產出、版面檢查 | `pdf` skill | 本機 PDF library 或 manual review |
| 一頁紙、白皮書、履歷、作品集、landing page | `kami` | Markdown / HTML artifact |
| 技能搜尋、建立或安裝 | 先讀 `workflows/skill-and-plugin-adoption.md`；搜尋用 `find-skills`，建立 / 安裝用 `skill-creator` / `skill-installer` | 手動文件與本機 scripts |
| PRD、issue、triage | `to-prd` / `to-issues` / `triage`；無 issue tracker 時用 `TASK_CONTRACT.md` | `TASK_CONTRACT.md` |
| 通用 code review、PR review、local diff review | `code-reviewer` workflow 參考 | 本 repo review stance + project tests |
| 使用者明確要求建立 PR | `pr-creator` pattern | 手動 `gh pr create`，先跑驗證 |
| 安全審查、靜態分析、依賴風險 | `audit-prep-assistant` / `semgrep` / `codeql`；大型 cybersecurity skill pack 只作 taxonomy 參考 | threat checklist + package audit |
| PPT、簡報、slide deck | `workflows/presentation.md` | Markdown deck / local HTML slides |
| 跨前端/後端/DB/安全/AI/部署任兩類以上 | lead agent 先判斷是否分工 | 主 agent 本地切小步 |

## 外部能力採用規則

- 引入外部 GitHub repo、skill、plugin、agent pack、security pack、SDK 或 MCP server 前，先讀 `workflows/skill-and-plugin-adoption.md`。
- Understand-Anything 只用於大型陌生 repo / knowledge graph onboarding；`.understand-anything/` 輸出視為衍生 artifact，不是 starter 必備文件。
- CodeGraph 只在 `.codegraph/` 已存在或使用者明確要求建立索引時使用；它不取代 `rg`、直接讀檔與測試。
- Taste、Frontend Design、Shadcn、Its Hover 等 UI 能力只能在 UI 任務中依 `UI_SPEC.md` 或 `DESIGN_SYSTEM.md` 選一條主路線。
- `webapp-testing` 只在 web UI / Playwright 驗證任務啟用；非 web 專案不需要它。
- `code-reviewer` 只作 review workflow 參考；前端 UI review 仍依 `UI_SPEC.md`、`DESIGN_SYSTEM.md` 與專案 review 標準。
- `pr-creator` 只在使用者明確要求建立 PR 時使用；不得自動 push `main`，不得略過專案 PR template 與驗證命令。
- `update-docs` 只吸收 docs impact / docs sync workflow；不要採用來源 repo 的專案專用 docs mapping。
- Skill Creator / Find Skill 只用於重複流程的建立或搜尋；`find-skills` 的輸出只是候選，不作日常 coding 預設。

## RTK 使用規則

- RTK 是 `rtk-ai/rtk` 的 CLI proxy，用途是把常見 shell 輸出在進入 LLM context 前壓縮；先用 `rtk --version` 和 `rtk gain` 確認裝的是 Rust Token Killer，不是同名 Rust Type Kit。
- 適合：`rtk ls`、`rtk tree`、`rtk read`、`rtk grep`、`rtk git status`、`rtk git diff`、`rtk test <cmd>`、`rtk lint`、`rtk tsc`、`rtk playwright`、`rtk docker logs`。
- 不適合：需要完整原文、精確行號、完整 diff、完整測試 log、完整 JSON、完整錯誤堆疊、法務/安全證據保存時；這些情況用原生命令並加範圍限制，例如 `sed -n '1,160p' file`。
- 不在 Codex 全域啟用 Claude hook；Codex 內預設採「手動前綴」策略，只有當輸出可能很大時才加 `rtk`。
- RTK 輸出只能做定位和摘要；真正要改檔前，仍要讀相關原始檔片段。
- 用完可跑 `rtk gain` 看節省統計；沒有 tracking data 不代表不能用，只代表還沒累積資料。
