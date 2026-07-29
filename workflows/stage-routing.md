# Stage Routing

用途：使用者不是說「開新專案」，而是用自然語言描述目前階段、交付對象或想要的產出時，讓 agent 立刻知道要讀哪些文件、產出什麼、停止在哪裡。

## 使用規則

- 先判斷使用者描述的是哪個階段，不要直接開始寫 code。
- 讀本檔後，只加讀該階段需要的最小文件。
- 產出必須是可 review 的檔案、URL、測試命令或明確清單。
- 若缺少必要資訊，每次只問一個會影響交付的問題。

## 階段分流表

| 使用者描述 | 立即讀取 | 主要產出 | 停止條件 |
|---|---|---|---|
| 我要給測試者、讓人試用、內測包、beta 測試 | `workflows/validation-release.md`、`templates/conditional/TESTER_HANDOFF.md`；有 UI 再讀 `workflows/ui-ux.md` | `TESTER_HANDOFF.md`、測試路徑、已知限制、回報格式 | 測試者拿到文件後能自己操作並回報問題 |
| 我要上 preview、給別人開連結看 | `workflows/validation-release.md`；有 web/DB 再讀 `workflows/fullstack.md` | preview URL、env 檢查、smoke test 結果 | preview 可開且核心流程可操作 |
| 我要正式上線、release、發佈 | `workflows/validation-release.md`；依專案類型讀 UI/fullstack/macOS/agent 文件 | release checklist、驗證結果、rollback 或已知限制 | 上線條件與阻塞項清楚 |
| 我要做 UI 檢查、畫面 polish、給人看畫面 | `workflows/ui-ux.md`、`workflows/validation-release.md` | `DESIGN_REVIEW.md`、desktop/mobile 檢查、console 結果 | 核心畫面、狀態、文字溢出已檢查 |
| 我要先做 prototype、試幾種方向、驗證狀態模型、看看互動順不順 | `workflows/ui-ux.md`、`workflows/validation-release.md` | disposable prototype、UI variants、state-model demo、採用/放棄判斷 | 已選定方向或明確放棄，且不把 prototype 當 production code |
| 我有 App 截圖，要整理設計規範、生成設計圖、產出 icon 或背景素材 | `workflows/ui-ux.md`、`workflows/design-system-from-screenshots.md` | `DESIGN_SYSTEM.md`、screen map、design tokens、`assets/ASSET_MANIFEST.md` | 規範可追溯截圖、設計圖覆蓋 tabs/彈窗/狀態、素材命名清楚 |
| 我要做資料庫/API/Auth/權限確認 | `workflows/fullstack.md`、`startup/02-required-project-docs.md` | `DATA_MODEL.md`、`API_CONTRACT.md`、RLS/權限風險 | 資料邊界和驗證方式清楚 |
| 我要做 agent、自動化、human approval、背景任務 | `workflows/production-agent.md`、`workflows/validation-release.md` | `AGENT_RUNTIME.md`、tool 權限、副作用、approval gate | state、event、tool、verifier 已定義 |
| 我要比較多種觀點、處理衝突證據、研究重大選擇或找出跨視角盲點 | `workflows/research-synthesis.md`、`templates/conditional/RESEARCH_SYNTHESIS.md` | trigger 建議與使用者確認；確認後產出 `RESEARCH_SYNTHESIS.md` | 證據、矛盾、信心、隱藏關聯與決策建議均可追溯 |
| 我要打包 macOS app、處理權限、DMG、notarization | `workflows/macos-build-release.md`、`workflows/validation-release.md` | `MACOS_RELEASE_CHECKLIST.md`、簽名/TCC/包裝驗證 | 固定 bundle id、路徑、簽名與驗證結果清楚 |
| 我要做簡報、PPT、提案、發表頁、一頁紙、白皮書、履歷、作品集、landing page | `workflows/presentation.md` | `PRESENTATION_BRIEF.md`、deck / PDF / HTML 路徑或預覽 URL | 重點、來源、格式、字體與版面符合使用場景 |
| 我要收尾、交接、下次接續 | `workflows/agent-file-structure.md`、`workflows/validation-release.md` | handoff、open loops、文件結構分流 | 下一個 agent 能接手且知道不能做什麼 |

## 給測試者交付流程

觸發詞：測試者、試用、內測、beta、QA、請朋友測、給人操作、測試文件、回報問題。

最小流程：

1. 確認測試對象與測試環境：本機、preview、TestFlight、DMG、帳號、測試資料。
2. 跑最小驗證：啟動、核心流程、console/log、已知錯誤。
3. 產出 `TESTER_HANDOFF.md`，內容必須讓測試者不用讀開發文件也能開始。

`TESTER_HANDOFF.md` 必填：

- 測試目的：
- 測試網址或檔案路徑：
- 測試帳號或測試資料：
- 請測的 3 條核心路徑：
- 不需要測的範圍：
- 已知限制：
- 問題回報格式：
- 截圖或錄影要求：
- 測試截止條件：
- 開發者已驗證：

## 回報格式

```md
階段分流：
- 判斷階段：
- 已讀取：
- 需要產出：
- 缺少資訊：
- 下一步：
```
