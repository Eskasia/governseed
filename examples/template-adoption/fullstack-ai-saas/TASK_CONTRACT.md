# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-101 | completed | REQ-101@1 | AC-101 | Run citation and fallback smoke checks. |
| TASK-102 | completed | REQ-102@1 | AC-102 | Run the two-workspace isolation check. |

## Task: RAG preview thin slice

- Input: PROJECT_BRIEF, SPEC, CONTEXT, RAG_DESIGN, EVAL_PLAN, AI_SECURITY_REVIEW
- Available tools: local tests, Browser/Chrome, Playwright smoke
- Expected output: workspace login, document upload, question answer with citation
- Verification: tenant isolation smoke, citation smoke, fallback smoke
- Out of scope: billing, external OAuth, production migration

## Task: Tenant isolation evidence

- Input: DATA_MODEL, RAG_DESIGN, AI_SECURITY_REVIEW
- Available tools: unit test, seed fixtures, manual preview account check
- Expected output: two-tenant fixture with blocked cross-tenant retrieval
- Verification: tenant A query cannot return tenant B document; failed access is logged without document text
- Out of scope: enterprise SSO, admin analytics, paid plan limits

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-101 | AC-101 | REQ-101@1 | check:citation-and-fallback-smoke | passing | 2026-07-13 |
| EVD-102 | AC-102 | REQ-102@1 | check:synthetic-workspace-isolation | passing | 2026-07-13 |
