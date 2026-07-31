# SPEC.md

## Scope

- One self-contained HTML page, a ten-minute deck with separated speaker notes, and a claim-to-source map covering both.

## Non-goals

- 不做多頁行銷網站。
- 不做客戶案例、採用數字或效果宣稱。
- 不做互動 demo 或試用環境。

## User flows

1. 讀者收到連結，三分鐘內讀完一頁式說明並判斷是否相關。
2. 讀者列印或另存 PDF 轉寄給同事。
3. 簡報者用同一組事實敘述講完十分鐘。

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-501@1 | add | must | Every factual statement in either deliverable maps to a named project document. | SRC-501 | product-owner-role | n/a |
| REQ-502@1 | add | redline | Neither deliverable may state adoption, customer, or effectiveness claims. | SRC-502 | reviewer-role | n/a |
| REQ-503@1 | add | must | The one-pager renders and prints without network access. | SRC-501 | product-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-501 | REQ-501@1 | Yes if every statement resolves in the claim-to-source map; no otherwise. | A statement has no source document. |
| AC-502 | REQ-502@1 | Yes if the review finds no adoption or effectiveness claim; no otherwise. | A deliverable implies external adoption. |
| AC-503 | REQ-503@1 | Yes if the page renders and prints offline; no otherwise. | The page requires a network fetch to render. |

## Edge cases

- 專案文件在匯出後改動，說明變成過期。
- 列印時分頁切斷關鍵段落。
- 簡報講稿被貼進投影片，事實敘述無法逐條核對。

## Failure conditions

- 為了讀起來有力而寫出無法指回文件的敘述。
- 用「已被採用」這類無證據的宣稱填補說服力。

## Open questions

- 是否需要一份英文版一頁式說明。

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved localisation choices as not-stated rows in `OPEN_LOOPS.md`.
