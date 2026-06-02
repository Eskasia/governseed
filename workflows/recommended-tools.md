# Recommended Tools

推薦的 skill 和工具來源，按觸發條件選用。

引入任何外部來源前，先讀 `workflows/skill-and-plugin-adoption.md`；本檔只列候選與路由，不代表已安裝或全域採用。

## GitHub 候選來源分級

| 來源 | 採用層級 | 融合方式 | 不做 |
|---|---|---|---|
| `anthropics/skills` | conditional workflow | 參考 `SKILL.md` 結構、觸發條件、驗證欄位 | 不把示例 skills 全量導入 |
| `Lum1104/Understand-Anything` | conditional workflow | 大型陌生 repo 才用 knowledge graph onboarding | 不把 `.understand-anything/` 當 required artifact |
| CodeGraph | conditional workflow | `.codegraph/` 已存在或明確要求索引時查 symbol / call graph / impact | 不取代 `rg`、讀檔、測試 |
| `Leonxlnx/taste-skill` | conditional workflow | UI 任務依 `UI_SPEC.md` / `DESIGN_SYSTEM.md` 選單一 variant | 不同 taste variants 不同時全開 |
| `anthropics/knowledge-work-plugins` | reference-only | 參考 plugin manifest、commands、skills 分層 | 不把 role plugins 變成 starter 預設 |
| `affaan-m/ECC` | reference-only | 參考單一路線、分層規則、薄 adapter | 不複製 install system、hooks、agent catalog |
| `mukul975/Anthropic-Cybersecurity-Skills` | reference-only | 安全任務可參考 MITRE / NIST taxonomy | 不導入數百個安全技能 |
| academic research skill repos | conditional workflow | 研究、論文、citation 任務才啟用 | 不放進日常 coding path |
| `pi`、Skill Creator Cloud、Awesome Shadcn UI | 暫不採用 | 先確認 repo 指向、license、維護狀態與任務匹配 | 不寫成主線規則 |

## 核心 Skill 來源

| 來源 Repo | 類別 | 推薦安裝 | 備註 |
|---|---|---|---|
| `openai/skills` | 官方 Codex skill | OpenAI docs, Playwright, PDF, Vercel deploy, skill creator, CLI creator | 不需全量安裝 |
| `mattpocock/skills` | 工程 workflow | grill-with-docs, tdd, diagnose, prototype, zoom-out, handoff, neat-freak | 依需求選裝 |
| `trailofbits/skills` | 安全審查 | audit prep, differential review, semgrep, codeql, supply chain | 安全需求時安裝 |
| `Leonxlnx/taste-skill` | UI/UX 審美 | design-taste-frontend, image-to-code, redesign | 依 UI 方向選 variant |
| `voidful/academic-skills` | 論文研究 | academic-research | 學術任務時安裝 |
| `op7418/guizang-ppt-skill` | 簡報 | guizang-ppt-skill | HTML 網頁簡報用 |
| `tw93/Kami` | 文件排版 | kami | one-pager, resume, portfolio, landing page |

## Developer lifecycle skills

這些來源只作候選路由，不複製 `SKILL.md`、不安裝整包、不跳過 `workflows/skill-and-plugin-adoption.md`。

| Skill | 來源 | 採用層級 | 觸發條件 | 邊界 |
|---|---|---|---|---|
| `webapp-testing` | `anthropics/skills` | conditional workflow | web UI、Playwright、瀏覽器驗證、截圖與 console log 任務 | 只在 web app 驗證時啟用，不取代專案測試命令 |
| `code-reviewer` | `google-gemini/gemini-cli` | conditional workflow | 使用者要求 code review、PR review、local diff review | 只作 review workflow 參考，不覆蓋專案內 review 標準 |
| `pr-creator` | `google-gemini/gemini-cli` | conditional workflow | 使用者明確要求建立 PR | 不自動 push `main`，必須遵守專案 PR template 與驗證命令 |
| `update-docs` | `vercel/next.js` | reference-only / conditional workflow | diff 影響 docs、使用者要求同步文件、階段收尾 | 只吸收 docs impact workflow，不採用 Next.js 專用 docs mapping |
| `find-skills` | `vercel-labs/skills` | skill discovery only | 使用者要求找 skill，或任務明顯需要外部能力搜尋 | 只產生候選清單，搜尋結果仍必須走 adoption gate |
| `cache-components` / `next-cache-components` | `vercel/next.js`、`vercel-labs/next-skills` | conditional workflow | `TECH_STACK.md` 已選 Next.js，且 `next.config.*` 啟用 `cacheComponents: true` | 不作通用前端預設，不把 starter 綁到 Next.js |
| `frontend-code-review` | `langgenius/dify` | reference-only | 想設計前端 review rule catalog 與 references 結構 | 不直接採用 Dify / React Flow 專案規則 |
| `fullstack-developer` | `Shubhamsaboo/awesome-llm-apps` | 不納入 | n/a | 預設 React / Next.js / Node / Prisma 等路線，會破壞技術路線 gate |
| `fix` | `facebook/react` | 不納入 | n/a | 綁定 React repo 的 `yarn prettier` / `yarn linc`，不能作跨專案 bugfix 預設 |

## UI / 前端補強

| Repo | 觸發條件 | 用途 |
|---|---|---|
| `nextlevelbuilder/ui-ux-pro-max-skill` | 需要 UI 設計系統方向 | 設計系統生成 |
| `pbakaus/impeccable` | 上線前 UI 驗收 | audit / polish |
| `nexu-io/open-design` | 方向不確定需要原型 | disposable prototype |
| `VoltAgent/awesome-design-md` | 需要 DESIGN.md 或品牌設計語言 | 設計文件參考 |
| `DavidHDev/react-bits` | 需要高質感 React 元件 | 動畫 / 展示參考 |
| `uiverse-io/galaxy` | 需要 CSS/Tailwind 小元件 | UI 靈感 |
| `itshover/itshover` | 需要 animated icons | hover/tap micro-interaction |
| `shadcn-ui/ui` | 需要可維護 app 元件 | 依 UI_SPEC 客製 |

## 工程 / 知識管理

| Repo | 觸發條件 | 用途 |
|---|---|---|
| `colbymchenry/codegraph` | 大 repo 需要結構理解 | symbol / call graph 查詢 |
| `rtk-ai/rtk` | 常見 CLI 輸出過大、token 壓力高 | `rtk ls/read/grep/git diff/test/lint/tsc/playwright` 壓縮輸出；Codex 內採手動前綴 |
| `sdyckjq-lab/llm-wiki-skill` | 需要沉澱跨專案知識 | 流程、錯誤模式、驗證命令 |
| `docling-project/docling` | 需要文件轉 Markdown/JSON | PDF / Office 轉換 |
| `opendatalab/MinerU` | 複雜 PDF / Office 解析 | 結構化文件抽取 |
| `addyosmani/agent-skills` | 工程品質 skill 參考 | 不直接安裝，作為設計參考 |

## 架構 / AI 系統參考

| Repo | 觸發條件 | 用途 |
|---|---|---|
| `humanlayer/12-factor-agents` | production agent 設計 | 已整理到 `workflows/production-agent.md` |
| `ombharatiya/ai-system-design-guide` | AI 系統設計 | 已整理到 `workflows/ai-system-design.md` |
| `microsoft/ai-agents-for-beginners` | 學習 agent 架構 | 教學參考，不直接進流程 |
| `emcie-co/parlant` | 客服 AI / 受控回覆 | 架構參考 |
| `ashishps1/awesome-system-design-resources` | 系統架構設計 | ADR 前置參考 |

## 安全

| Repo | 觸發條件 | 用途 |
|---|---|---|
| `projectdiscovery/nuclei` | 上線前 security smoke | 只用在自有 URL |

## 專業領域

| Repo | 觸發條件 | 用途 |
|---|---|---|
| `aklofas/kicad-happy` | EDA / PCB / KiCad 任務 | 完整 12 個 electronics skills |

## 安裝原則

- 不全量安裝任何 skill 合集；依任務需求選裝。
- 專業領域 skill 平常不觸發，只在對應任務才啟用。
- 版本、價格、模型排行等資訊必須現查，不依賴文件中的靜態數值。
- context/token 壓力緩解工具（如 `mksglu/context-mode`）先以實驗方式使用，見 `docs/experiments/context-mode.md`。
- RTK 是 CLI 工具，不當成 Codex skill 全量安裝；除非要開發 RTK 本身，否則不安裝它 repo 內的 Rust/TDD/PR triage skills。
