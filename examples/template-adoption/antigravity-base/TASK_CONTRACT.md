# TASK_CONTRACT.md

## 任務總覽

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-001 | completed | REQ-001@1 | AC-001 | Run the antigravity smoke script against a freshly generated project. |
| TASK-002 | completed | REQ-002@1 | AC-002 | Parse every shipped SKILL.md frontmatter in the governance test suite. |
| TASK-003 | completed | REQ-003@1 | AC-003 | Review fixture wording against the published claim boundary. |

## 任務詳情

### 任務：建立 antigravity fixture

- 輸入：base profile、fixed templates、`init --agent antigravity` 產生的 `.agents/`
- 可用工具：scripts/init.mjs, scripts/doctor.mjs, scripts/smoke-antigravity.mjs
- 預期輸出：filled antigravity-base fixture with its generated runtime adapter
- 驗證方式：compare generated runtime files with the checked-in fixture, then compare doctor JSON with expected output
- 不做事項：do not hand-edit `.agents/`; regenerate it instead
- 完成標準：fixture status is ready and the smoke script reports no difference
- 風險 / 阻塞：adapter content changes require regenerating this fixture in the same commit

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-001 | AC-001 | REQ-001@1 | command:node scripts/smoke-antigravity.mjs | passing | 2026-07-31 |
| EVD-002 | AC-002 | REQ-002@1 | command:node --test tests/governance/antigravity-runtime.test.mjs | passing | 2026-07-31 |
| EVD-003 | AC-003 | REQ-003@1 | command:node scripts/doctor.mjs --strict examples/template-adoption/antigravity-base | passing | 2026-07-31 |

## 驗收總結

- [x] 所有任務驗證方式已執行
- [x] 無未記錄的範圍外修改
- [x] OPEN_LOOPS.md 已更新
