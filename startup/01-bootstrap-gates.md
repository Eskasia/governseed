# 01 Bootstrap Gates

## 主流程

新專案固定走：

1. 規格：Q1-Q9、追問、PROJECT_BRIEF、SPEC、CONTEXT
2. 路線：產品形態 / 技術路線 gate、TECH_STACK、必要 ADR
3. 設計：TASK_CONTRACT、AGENTS、必要條件文件
4. 條件文件：UI、全端、環境、API、資料模型、Agent runtime
5. 計畫：5-10 步，每步有驗證
6. 實作：一次只做一個步驟
7. 驗證：測試、Browser/Chrome、Playwright、DB、部署檢查
8. 收尾：handoff、neat-freak、repomix、gstack-style checklist

## Q1-Q9

Q1-Q9 的意義是確認需求、限制、驗收、部署與技術偏好，支撐後續產品形態與技術路線決策；不是要求使用者一開始就懂技術。

Q1. 這個東西要解決誰的什麼問題？一句話，不能有「和」。  
Q2. 第一版成功的樣子是什麼？用可以觀察到的行為描述。  
Q3. 哪些情況出現，就代表做錯了？  
Q4. 第一版明確不做哪些事？至少三個。  
Q5. 有沒有不能動的現有系統、框架、或 API？  
Q6. 誰來驗收、怎麼驗？自己點、跑測試、給別人用。  
Q7. 要部署在哪裡？本機、preview、正式上線。  
Q8. 有沒有已經決定要用的技術或工具？  
Q9. 對效能或規模有沒有硬性要求？

## 產品形態 / 技術路線 Gate

Generated `AGENTS.md` 唯一定義 `GATE-INTENT-001` 與 `GATE-ROUTE-001` 的 owner、status、evidence、event-only review trigger 與 fallback；本文件只說明 bootstrap 方法。Q1-Q9 後先讀 `workflows/product-shape-tech-route.md`，並在文件中選定一條路線：

- `user-declared route`：使用者已指定產品形態或技術棧；agent 檢查它是否和 Q1-Q9 衝突，補齊缺漏層與風險。
- `ai-recommended route`：使用者不知道技術路線；agent 根據 Q1-Q9 推薦唯一第一版產品形態與唯一主技術路線。

完成標準：

- `PROJECT_BRIEF.md` 已寫清楚產品形態決策、決策模式、Q1-Q9 依據、排除的其他形態。
- `TECH_STACK.md` 已寫清楚唯一主路線、前端、後端、資料庫、主要框架 / SDK、部署方式；沒有某層時填 `n/a` 並說明。
- `TECH_STACK.md` 已寫清楚不用哪些技術路線、後期風險、重評估條件、新技術引入 gate。
- 高成本或難回頭的路線選擇已寫入 `docs/adr/*.md`；無法定案的路線問題已寫入 `OPEN_LOOPS.md`，並回到 `AGENTS.md` 套用 `GATE-ROUTE-001`。

## 進下一關條件

- `GATE-INTENT-001` 與 `GATE-ROUTE-001` 已依 generated `AGENTS.md` 評估。
- SPEC 的驗收標準都是 yes/no。
- TASK_CONTRACT 每個任務都有驗證方式。
- OPEN_LOOPS 明確列出尚未決定的事。
- 若包含 production-facing LLM agent / automation / tool use，`AGENT_RUNTIME.md` 已完成。
- 只有提出 durable rule 時，才記錄 selected destination、canonical owner 與 evidence；沒有提案時不執行文件結構分流。
- 使用者明確說「確認」。
