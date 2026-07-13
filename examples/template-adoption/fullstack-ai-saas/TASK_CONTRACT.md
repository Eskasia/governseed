# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-101 | completed | REQ-101@1 | AC-101 | Run citation and fallback smoke checks. |
| TASK-102 | completed | REQ-102@1 | AC-102 | Run the two-workspace isolation check. |

## 任務：RAG preview thin slice

- 輸入：PROJECT_BRIEF、SPEC、CONTEXT、RAG_DESIGN、EVAL_PLAN、AI_SECURITY_REVIEW
- 可用工具：local tests、Browser/Chrome、Playwright smoke
- 預期輸出：workspace login、document upload、question answer with citation
- 驗證方式：tenant isolation smoke、citation smoke、fallback smoke
- 不做事項：billing、external OAuth、production migration

## 任務：Tenant isolation evidence

- 輸入：DATA_MODEL、RAG_DESIGN、AI_SECURITY_REVIEW
- 可用工具：unit test、seed fixtures、manual preview account check
- 預期輸出：two-tenant fixture with blocked cross-tenant retrieval
- 驗證方式：tenant A query cannot return tenant B document; failed access is logged without document text
- 不做事項：enterprise SSO、admin analytics、paid plan limits

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-101 | AC-101 | REQ-101@1 | check:citation-and-fallback-smoke | passing | 2026-07-13 |
| EVD-102 | AC-102 | REQ-102@1 | check:synthetic-workspace-isolation | passing | 2026-07-13 |
