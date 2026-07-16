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
- `public` uses a canonical HTTPS `public-pointer`; `approved-private-external` uses an `external-record:<opaque-id>` pointer; `private-interactive` uses `attestation-only` plus `n/a`; `synthetic` uses `attestation-only` plus `n/a` or a canonical public pointer.
- Private and synthetic sources set `Content retained` to `no`.
- Do not store an ordinary hash or masked excerpt of private content, a private URL or query token, an absolute home path, a real person identifier, or a credential.
- Record confirmation with a lowercase `*-role` label and ISO date; pending/rejected rows may leave the date `n/a`. The requirement revision must repeat a confirmed source role exactly. Keep every not-stated item in `OPEN_LOOPS.md`.
- Product-shape `Evidence` contains at least one confirmed `SRC` and one active `REQ@revision`, and exactly matches the evidence set in `TECH_STACK.md`.

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
