# Product Shape and Tech Route Workflow

適用：新專案完成 Q1-Q9 後、寫 code 前，要決定第一版做成網站、小程序、App、純後端 API、管理系統、agent service，或其他主形態。

本 workflow 提供 `GATE-ROUTE-001` 的決策與重評估方法；generated `AGENTS.md` 仍是該 gate lifecycle 欄位的唯一 canonical owner。

## 核心原則

- Q1-Q9 用來收集約束，不要求使用者先懂技術。
- 每個專案第一版只能有一個主產品形態與一條主技術路線。
- 固定模板只放共同治理規則；具體框架、SDK、部署平台只能寫進專案文件、fixture 或條件 workflow。
- 參考 ECC 的分層做法：共享規則在核心層，平台或工具差異放在 adapter 層；採用或安裝路線一次只選一條，避免疊加。

## 決策模式

| 模式 | 何時使用 | Agent 責任 |
|---|---|---|
| `user-declared route` | 使用者已指定產品形態、技術棧、平台、框架或不能動的既有系統 | 記錄使用者路線；檢查和 Q1-Q9 是否衝突；補齊前端、後端、資料庫、SDK、部署、風險與重評估條件 |
| `ai-recommended route` | 使用者是新手、不知道有哪些技術路線，或只描述問題與使用場景 | 根據 Q1-Q9 推薦唯一產品形態與唯一技術路線；說明排除其他路線的理由 |

## Q1-Q9 對應

| 問題 | 對路線的作用 |
|---|---|
| Q1 使用者與問題 | 判斷產品是人用 UI、系統對系統 API，或 agent / automation |
| Q2 第一版成功樣子 | 判斷第一版需要可操作產品、demo、內部工具或服務端能力 |
| Q3 失敗條件 | 排除不適合的複雜度、平台與資料流 |
| Q4 明確不做 | 限制第一版不要同時做多平台或多 runtime |
| Q5 不能動的系統 / 框架 / API | 優先約束技術棧與 adapter 邊界 |
| Q6 驗收方式 | 決定需要 Browser、device、API test、DB check 或人工 tester handoff |
| Q7 部署位置 | 決定本機、preview、production、desktop package 或 backend service |
| Q8 已定技術或工具 | 進入 `user-declared route`，或記錄為候選約束 |
| Q9 效能或規模 | 判斷是否需要資料庫、queue、cache、native app、後端 API 或簡化 MVP |

## 產品形態候選

| 形態 | 適合情況 | 常見排除原因 |
|---|---|---|
| Website / landing page | 主要是展示、內容、報名、文件或單次互動 | 需要登入後反覆操作、複雜資料狀態或內部工作流 |
| Web app / 管理系統 | 需要登入、資料表、工作流、dashboard、反覆操作 | 只需要公開展示，或必須使用手機原生能力 |
| Mobile / desktop app | 需要裝置權限、離線、本機檔案、TCC、原生 UX | 第一版只需驗證資料流或可用 web preview |
| 小程序 | 使用者主要在特定平台入口，且平台限制是產品需求的一部分 | 需要跨平台、開放 web、或平台審核會拖慢第一版 |
| 純後端 API | 使用者是其他系統或前端已存在，只需要服務端合約 | 需要人直接使用或驗收核心流程 |
| Agent service / automation | AI 會替使用者做事、調工具、跑背景任務或需要 approval | 只是一次性摘要、分類、draft 或手動研究 |

## 評估標準

選路線時固定比較：

- 產品形態適配：是否直接支撐 Q1-Q2。
- 專案複雜度：是否避免第一版同時做多平台、多 runtime、多 provider。
- AI 友好：文件、測試、目錄與責任邊界是否容易讓 agent 維護。
- 邊界清楚：前端、後端、資料庫、SDK、外部服務、adapter 是否分得清。
- 可維護：後期 debug、測試、升級和回滾是否可追蹤。
- 可迭代：第一版是否能薄切片驗證，之後再擴展。

## 必填輸出

- `PROJECT_BRIEF.md`：產品形態決策、決策模式、Q1-Q9 依據、排除的其他形態。
- `TECH_STACK.md`：唯一主技術路線、前端、後端、資料庫、主要框架 / SDK、部署方式、排除路線、風險、重評估條件、新技術引入 gate。
- `docs/adr/*.md`：高成本或難回頭的路線決策。
- `OPEN_LOOPS.md`：仍無法定案的路線問題；只要路線問題是 open，就不得開始實作。

## 新技術引入 Gate

每次新增框架、SDK、provider、資料庫、queue、agent framework、MCP server、native wrapper 前，先回答：

- 是否符合 `TECH_STACK.md` 的唯一主路線？
- 是否解決第一版驗收需要的問題？
- 是否破壞前端、後端、資料庫、adapter 邊界？
- 是否讓專案從單一路線變成多 runtime 疊加？
- 是否需要新增或更新 ADR？

## 重評估條件

只有出現以下情況才重新評估技術路線：

- Q1-Q2 的核心使用者或成功行為改變。
- Q5 的既有系統、平台、API 約束改變。
- Q6-Q7 的驗收或部署方式改變。
- Q9 的效能、規模、資料量或延遲要求超出原路線。
- 現有路線無法通過驗證，且風險已記錄到 `OPEN_LOOPS.md` 或 ADR。
