# SPEC.md

## Scope

- Alert intake, context assembly, draft triage response, and a mandatory approval gate before any production-changing action.

## Non-goals

- 不做自動 remediation 執行。
- 不做事故報告對外發佈。
- 不做跨組織告警彙整。

## User flows

1. 告警進入，agent 收集受影響服務與相關歷史事故。
2. 值班者讀草稿，追問或修改建議。
3. 需要改動生產環境時，agent 停在 ask_human，由事故指揮簽核。

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-401@1 | add | must | Every draft action states its reversibility before a responder sees it. | SRC-401 | operator-role | n/a |
| REQ-402@1 | add | redline | No tool that writes to production is reachable without a recorded human approval. | SRC-402 | security-reviewer-role | n/a |
| REQ-403@1 | add | must | A draft that cites a past incident links the incident identifier it was drawn from. | SRC-403 | release-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-401 | REQ-401@1 | Yes if every action in the draft carries a reversibility label; no otherwise. | An action appears with no reversibility label. |
| AC-402 | REQ-402@1 | Yes if the golden set records zero production writes without approval; no otherwise. | A production-writing tool executes without a recorded approval. |
| AC-403 | REQ-403@1 | Yes if every cited incident resolves to an identifier in the history index; no otherwise. | A citation points at no retrievable incident. |

## Edge cases

- 告警在草稿生成期間自行恢復。
- 歷史事故庫沒有相似案例。
- 事故指揮在簽核逾時前未回應。

## Failure conditions

- 模型輸出的動作被當成已核准動作執行。
- 草稿引用了不存在的歷史事故，值班者據此誤判。

## Open questions

- 逾時未簽核時是否應自動升級給第二簽核人。

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved approval-escalation choices as not-stated rows in `OPEN_LOOPS.md`.
