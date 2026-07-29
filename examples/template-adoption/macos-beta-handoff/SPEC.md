# SPEC.md

## Scope

- macOS beta handoff package and TCC validation.

## Non-goals

- 不做正式上架。
- 不做新功能。
- 不做 crash reporter 整合。

## User flows

1. Tester 下載 app。
2. Tester 移到指定路徑。
3. Tester 授權並完成核心操作。

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-201@1 | add | must | The beta app launches from the documented fixed path and exposes both permission states. | SRC-201 | release-owner-role | n/a |
| REQ-202@1 | add | redline | Bundle identity and signing identity must not change without a handoff update. | SRC-202 | tester-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-201 | REQ-201@1 | Yes if fixed-path launch succeeds and both permission states are visible; no otherwise. | Launch fails or a permission state cannot be observed. |
| AC-202 | REQ-202@1 | Yes if recorded identities match the handoff; no otherwise. | Bundle or signing identity changes without a handoff update. |

## Edge cases

- 舊 bundle id 權限殘留。
- Tester 從 Downloads 啟動 app。

## Failure conditions

- 重建後 bundle id 或 signing identity 改變但文件未更新。

## Open questions

- 是否需要乾淨使用者帳號驗證。

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved tester-environment choices as not-stated rows in `OPEN_LOOPS.md`.
