# TASK_CONTRACT.md

## 任務總覽

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-001 | completed | REQ-001@1 | AC-001 | Run strict doctor against the base fixture. |
| TASK-002 | completed | REQ-002@1 | AC-002 | Inspect generated scope and run fixture validation. |

## 任務詳情

### 任務：建立 base fixture

- 輸入：base profile and fixed templates
- 可用工具：scripts/init.mjs, scripts/doctor.mjs
- 預期輸出：filled base-minimal fixture
- 驗證方式：compare doctor JSON with expected output
- 不做事項：do not add app code
- 完成標準：fixture status is ready
- 風險 / 阻塞：profile changes require expected JSON update

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-001 | AC-001 | REQ-001@1 | command:node scripts/doctor.mjs --strict examples/template-adoption/base-minimal | passing | 2026-07-13 |
| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |

## 驗收總結

- [x] 所有任務驗證方式已執行
- [x] 無未記錄的範圍外修改
- [x] OPEN_LOOPS.md 已更新
