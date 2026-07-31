# SPEC.md

## Scope

- Design-rule extraction from existing screens, plus a rebuild of the dispatch queue, single order, and exception handling screens.

## Non-goals

- 不改後端 API 與資料模型。
- 不做深色模式。
- 不做行動端佈局以外的觸控手勢。

## User flows

1. 調度員開啟佇列，依狀態篩選待處理訂單。
2. 調度員展開單筆訂單，改派或標記異常。
3. 客服值班人員從異常清單接手，回填處理結果。

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-301@1 | add | must | Every order status renders with the same token set on all three rebuilt screens. | SRC-301 | design-owner-role | n/a |
| REQ-302@1 | add | must | Each rebuilt screen renders a defined loading, empty, and error state. | SRC-302 | operator-role | n/a |
| REQ-303@1 | add | redline | No screen may introduce a color, spacing, or radius value that is absent from the declared token set. | SRC-301 | design-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-301 | REQ-301@1 | Yes if the same status maps to one token set across the three screens; no otherwise. | The same status renders in two different colors. |
| AC-302 | REQ-302@1 | Yes if all three states are reachable and recorded per screen; no otherwise. | A screen has no defined empty or error rendering. |
| AC-303 | REQ-303@1 | Yes if every declared value in the rebuilt screens resolves to a token; no otherwise. | A literal hex value appears outside the token block. |

## Edge cases

- 佇列一次回傳超過兩百列時的資料密度。
- 訂單狀態在使用者停留頁面期間被他人改動。
- 異常說明文字超過兩行。

## Failure conditions

- 設計規範只寫在文件、未落到 token，畫面再次分歧。
- 第三方元件預設樣式覆蓋 token 而無人察覺。

## Open questions

- 平板橫向是否需要與桌面相同的資料密度。

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved density and breakpoint choices as not-stated rows in `OPEN_LOOPS.md`.
