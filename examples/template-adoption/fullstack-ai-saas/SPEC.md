# SPEC.md

## Scope

- 建立一個 tenant-aware RAG preview。
- 支援文件上傳、提問、citation 顯示。

## Non-goals

- 不做 production billing。
- 不做外部 OAuth。
- 不做批次資料遷移。

## User flows

1. Owner 建立 workspace。
2. Member 上傳文件。
3. Member 提問並查看引用來源。

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-101@1 | add | must | Each answer displays at least one citation or an explicit fallback. | SRC-101 | product-owner-role | n/a |
| REQ-102@1 | add | redline | A query must never return a document from another workspace. | SRC-102 | security-reviewer-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-101 | REQ-101@1 | Yes if every answer shows a citation or explicit fallback; no otherwise. | An answer has neither a citation nor fallback. |
| AC-102 | REQ-102@1 | Yes if cross-workspace retrieval returns no document; no otherwise. | A document from another workspace is returned. |

## Edge cases

- 空文件。
- 沒有檢索結果。
- 使用者跨 tenant 存取文件。

## Failure conditions

- 回答沒有 citation。
- retrieval 前沒有套用 tenant filter。

## Open questions

- 第一版是否需要 PDF OCR。

## Lineage rules

- Requirement rows are append-only; replacement and withdrawal preserve prior revisions.
- Not-stated product choices remain in `OPEN_LOOPS.md` until a confirmed source resolves them.
