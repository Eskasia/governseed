# 00 Agent Start Here

## 不可跳過的規則

- 開工條件只引用 generated `AGENTS.md` 的 `GATE-INTENT-001` 與 `GATE-ROUTE-001`；本文件不重述 owner、status、evidence、review trigger 或 fallback。
- Q1-Q9 後讀 `workflows/product-shape-tech-route.md` 取得決策方法，再依 `AGENTS.md` 評估兩個 gate。
- 不准直接把使用者的一句想法變成完整實作。
- 不准同時啟用所有 skill；只能依風險選工具。
- 每個任務都要有輸入、可用工具、預期輸出、驗證方式、不做事項。
- UI、資料模型、部署、權限、金鑰、第三方服務，任何一項不清楚都要先寫入文件或列為 open loop。
- 不准把所有新規則都塞進 `AGENTS.md`；先依 `workflows/agent-file-structure.md` 判斷該寫入 LLMwiki、AGENTS、Skills、Hooks、Subagents 或 Plugins。
- 做 production-facing LLM agent、自動化、多步工具調用或 human approval 前，必須先建立 `AGENT_RUNTIME.md`；單次 AI draft / 摘要 / 分類不需要。
- 做 RAG、AI agent、MCP、eval pipeline、多租戶 AI SaaS、文件智能或 AI 系統設計前，先讀 `workflows/ai-system-design.md`，只採用符合當前專案的 gate。
- 使用者描述「目前做到某階段、要交付某對象、要產出某種包」時，先讀 `workflows/stage-routing.md` 做階段分流。

## 開工前回報格式

Agent 讀完本資料夾後，先回報：

```md
已讀取：
- <檔案 1>
- <檔案 2>

本專案初判需要：
- 固定文件：
- 條件式文件：
- 可能使用的 skill / tool：
- 可能需要的文件結構分流：
- 產品形態 / 技術路線模式：user-declared route / ai-recommended route
- 是否需要 AGENT_RUNTIME.md：
- 是否需要 RAG_DESIGN.md / EVAL_PLAN.md / AI_SECURITY_REVIEW.md：
- 目前不能開始寫 code 的原因：
```

## 問診原則

- 每次只問一個問題。
- 問題必須影響 MVP、資料模型、驗收、風險或部署。
- 使用者回答模糊時，用 yes/no 或二選一追問。
- 文件完成後，等使用者說「確認」才進入計畫。
