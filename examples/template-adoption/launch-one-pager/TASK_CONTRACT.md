# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-501 | completed | REQ-501@1 | AC-501 | Resolve every statement in both deliverables against the claim-to-source map. |
| TASK-502 | completed | REQ-502@1 | AC-502 | Run the claim review against the forbidden-claim list. |
| TASK-503 | completed | REQ-503@1 | AC-503 | Render and print the page with the network disabled. |

## 任務：建立事實對照表

- 輸入：PROJECT_BRIEF、SPEC、CONTEXT
- 可用工具：文件檢索、對照表草稿
- 預期輸出：claim-to-source map，每條敘述對應一份文件
- 驗證方式：對照表中沒有來源為空的列
- 不做事項：為了語氣加入無來源的敘述

## 任務：一頁式說明

- 輸入：claim-to-source map、TECH_STACK 的離線限制
- 可用工具：HTML 編輯、列印預覽、離線渲染檢查
- 預期輸出：單一自足 HTML 檔與其 PDF
- 驗證方式：關閉網路後渲染與列印皆正常，且分頁不切斷關鍵段落
- 不做事項：引入外部字體、追蹤腳本或多頁結構

## 任務：十分鐘簡報

- 輸入：claim-to-source map、一頁式說明
- 可用工具：Markdown 轉投影片匯出、講稿檔
- 預期輸出：投影片與獨立講稿
- 驗證方式：講稿與投影片分離，且每張投影片的事實敘述都能在對照表找到
- 不做事項：把講稿貼進投影片、加入未經證實的採用數字

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-501 | AC-501 | REQ-501@1 | check:synthetic-claim-source-resolution | passing | 2026-07-31 |
| EVD-502 | AC-502 | REQ-502@1 | check:synthetic-forbidden-claim-scan | passing | 2026-07-31 |
| EVD-503 | AC-503 | REQ-503@1 | check:synthetic-offline-render-print | passing | 2026-07-31 |
