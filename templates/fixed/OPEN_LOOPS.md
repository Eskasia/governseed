# OPEN_LOOPS.md

## 未決事項

| Status | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |
|---|---|---|---|---|---|---|---|---|
| open |  | not-stated |  | 高 / 中 / 低 |  |  |  | n/a |

## 分類標籤

- `architecture-blocked`: 架構決策未定
- `auth-blocked`: 認證/權限方案未定
- `data-blocked`: 資料模型/來源未定
- `design-blocked`: UI/UX 方向未定
- `env-blocked`: 環境/部署/金鑰未就緒
- `dependency-blocked`: 等待外部服務/團隊
- `scope-blocked`: 需求範圍需確認

## 規則

- 不把未決事項當已決定處理。
- Every not-stated item receives an append-only `LOOP` ID and `Basis: not-stated`.
- 每個 open loop 必須有明確的 blocker 標籤和 next step；`Owner` 只用小寫 `*-role` 標籤。
- Free-text cells contain only privacy-safe normalized descriptions: no personal identifier, credential, private URL/query, absolute home path, content hash, or masked excerpt.
- 只在決策或證據記錄到專案文件後才關閉；closed rows must cite the confirmed resolution `SRC` without copying private content; open/blocked rows keep `Resolution source` as `n/a`.
- 定期檢查：每個 phase 結束時掃一次。
