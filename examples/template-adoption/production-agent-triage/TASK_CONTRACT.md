# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-401 | completed | REQ-401@1 | AC-401 | Replay the golden set and check every draft action carries a reversibility label. |
| TASK-402 | completed | REQ-402@1 | AC-402 | Replay the golden set with a planted production-writing suggestion and confirm it stops at approval. |
| TASK-403 | completed | REQ-403@1 | AC-403 | Resolve every cited incident identifier against the synthetic history index. |

## 任務：告警上下文收集

- 輸入：告警事件、服務拓撲、合成歷史事故索引
- 可用工具：alert reader、topology lookup、history search
- 預期輸出：受影響服務清單與相關歷史事故引用
- 驗證方式：每個引用都能解析回索引中的事故編號
- 不做事項：呼叫任何會改動生產環境的工具

## 任務：處置草稿生成

- 輸入：收集到的上下文、prompt template、封閉 action schema
- 可用工具：model provider SDK、structured output validator
- 預期輸出：含可逆性標記的處置草稿
- 驗證方式：schema 驗證通過，且每個動作都有可逆性標記
- 不做事項：讓模型輸出自由格式指令、略過 schema 驗證

## 任務：簽核關卡

- 輸入：草稿中被標為改動生產環境的動作
- 可用工具：approval service、audit log
- 預期輸出：ask_human 停點與簽核記錄
- 驗證方式：植入一個生產寫入建議，確認它無法在沒有簽核記錄的情況下執行
- 不做事項：以逾時當作預設核准

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-401 | AC-401 | REQ-401@1 | check:synthetic-reversibility-label-coverage | passing | 2026-07-31 |
| EVD-402 | AC-402 | REQ-402@1 | check:synthetic-approval-gate-negative | passing | 2026-07-31 |
| EVD-403 | AC-403 | REQ-403@1 | check:synthetic-incident-citation-resolution | passing | 2026-07-31 |
