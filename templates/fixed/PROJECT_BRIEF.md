# PROJECT_BRIEF.md

## 一句話

-

## 使用者

-

## 要解決的問題

-

## MVP

-

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

### Source rules

- This registry stores attestations and pointers, never private source content.
- Source IDs are append-only. Do not delete or reuse an ID when intent changes.
- Private sources use only `opaque-pointer` or `attestation-only`, and `Content retained` must be `no`.
- Do not store an ordinary hash or masked excerpt of private content, a private URL or query token, an absolute home path, a real person identifier, or a credential.
- Record confirmation with a role label and ISO date; keep every not-stated item in `OPEN_LOOPS.md`.

## 產品形態決策

- 決策模式：
- 第一版產品形態：
- Q1-Q9 依據：
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：
- 何時重新評估：
- Decision status：
- Evidence：
- Nearest alternative：
- Review trigger：

## 明確不做

-

## 驗收者

-

## 完成標準

- 新 agent 能在 30 秒內理解方向。
- 問題、使用者、MVP 沒有混在同一句話裡。
- 第一版產品形態和排除形態已寫清楚。
