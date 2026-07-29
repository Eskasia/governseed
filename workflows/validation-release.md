# Validation And Release

## 每步驗證

- 本機能啟動，沒有 crash。
- 改動符合 TASK_CONTRACT。
- 沒有超出本步範圍的意外修改。
- 有測試就跑測試；失敗只記錄 stable code、可重現步驟與 privacy-safe normalized error metadata，不持久化 raw model / tool output。
- 有 UI 就用 Browser/Chrome 看 desktop/mobile、console、核心流程。
- 有 screenshot、generated UI 或 design spec 時，用 Browser/Chrome 截圖做 side-by-side critique。
- 有 DB 就驗證 migration、RLS、seed/mock data。

## 上線前檢查

- `npm test` / `pnpm test` / repo 指定測試。
- `npm run lint` / `pnpm lint`。
- `npm run build` / `pnpm build`。
- Playwright smoke 100% 通過。
- preview URL 可開，核心路徑可操作。
- ENV_CHECKLIST 的 preview/production env 已確認。

## UI / App Building 驗收

只在有 `UI_SPEC.md`、`DESIGN_SYSTEM.md` 或 `DESIGN_REVIEW.md` 時啟用：

- 視覺目標已保存或可追溯：screenshot、wireframe、generated UI、Figma、Open Design 或 HTML prototype。
- Browser/Chrome 已截圖檢查 desktop/mobile。
- side-by-side critique 已列出 layout、spacing、typography、color、assets、interaction、data realism 差異。
- loading、empty、error、disabled、focus、hover/tap 狀態已覆蓋。
- demo data 已標明；真實資料已記錄來源。
- 文字沒有溢出、重疊或遮擋。
- 結果不是只做靜態仿圖；核心流程可操作。

## Agent 上線前檢查

只在有 `AGENT_RUNTIME.md` 時啟用：

- 核准的 prompt-template version、context window schema、structured outputs 都在 repo / docs 中可 review；private runtime prompt 不落盤。
- 每個 tool 都有權限、副作用、idempotency、rollback。
- 高風險 action 有 human approval。
- 支援 launch、pause、resume、retry、cancel。
- 錯誤會 compact 後回到 context，不直接塞完整噪音。
- 至少有 replay / eval / E2E / smoke verifier。
- 可以用 `state + event -> next action` 解釋目前流程。

## AI 系統上線前檢查

只在有 `RAG_DESIGN.md`、`EVAL_PLAN.md` 或 `AI_SECURITY_REVIEW.md` 時啟用：

- RAG：ingestion、chunking、retrieval、rerank、citation、permission filter、fallback 都有記錄。
- Agent / MCP：tool 權限、sandbox、audit log、HITL、retry、kill switch 都有記錄。
- Eval：golden set、error taxonomy、privacy-safe trace metadata、quality / cost metric、regression gate 都有記錄。
- Security：prompt injection、data leakage、tenant isolation、output handling、API key lifecycle 都有記錄。
- MLOps：provider fallback、rate limit、budget alert、canary、rollback 或手動停用方式都有記錄。

## Governance Evidence Claim Gate

- Runtime proof 只可宣稱 generated entrypoint 通過 minimal first-response contract；mock 或 real smoke 都不是 model benchmark，也不能證明 governance effectiveness。
- Governance-impact evaluator 只評估 intake 已完成後的 delivery artifact，不宣稱測試 Q1-Q9 interview quality；公開 effectiveness claim 必須另過 real paired-run evidence gate。
- Real mode 是 synthetic-only：evaluator 只接受乾淨、已 commit 的 synthetic scenario；runtime proof 只使用生成的 synthetic fixture，禁止 private / customer / production content。
- Raw stdout/stderr、raw tool trace、environment variable、private prompt、masked excerpt、absolute home path 與 raw diff hunk 不得持久化；只能保存通過 validator 與 privacy scanner 的 normalized closed-schema evidence。
- Privacy scanner、session safety、output schema 或 cleanup 無法證明時必須 fail closed，以 stable code 結束且不留 artifact；cleanup 必須先於 persistence。
- Codex governance-impact real adapter 因 detached / re-parented descendant containment 未證明而回 `SESSION_SAFETY_UNAVAILABLE`。Claude 因 workspace containment 未證明而拒絕；Antigravity 缺 binary 時為 `RUNTIME_MISSING`，日後有 binary 仍須在 non-persistence 與 containment 證明前拒絕。

## 安全補強

- `projectdiscovery/nuclei` 只用在自己擁有或被授權的 local/preview/production URL。
- 第一版只做 security smoke：暴露的 debug route、常見 header、公開 bucket、錯誤頁洩漏、預設密碼、未保護 admin。
- 真正的滲透測試另開任務，不混在 MVP 實作內。

## 收尾

- 用 `handoff` skill 記錄狀態與下一步。
- 用 `neat-freak` skill 同步 docs。
- 用 `repomix --compress` 做整體 review 或交接。
- 里程碑後做 architecture hygiene：模組是否更深、介面是否更窄、命名是否更貼 domain、是否需要 `zoom-out` 或 `improve-codebase-architecture`。
- 可重用經驗回寫 LLMwiki。
- 依 `workflows/agent-file-structure.md` 判斷是否需要更新 `AGENTS.md`、新增 `Skills/`、補 `Hooks/`、建立 `Subagents/`，或升級成 `Plugins/`。
- 如果有 `AGENT_RUNTIME.md`，同步 state、tool、approval、verifier 的實際狀態。
- 如果有 AI 系統文件，同步 RAG、eval、security、observability、rollback 的實際狀態。
