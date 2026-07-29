# PROJECT_BRIEF.md

## 一句話

讓一個新專案在開始寫 code 前完成最小 governance bootstrap。

## 使用者

- 專案維護者
- Coding agent

## 要解決的問題

空白 prompt 容易讓 agent 在需求、驗證和 open loops 未清楚前直接實作。

## MVP

- 產生固定治理文件。
- 讓 doctor 確認固定文件已填寫。
- 保留未決事項的明確位置。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |
| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：governance CLI / document generator
- Q1-Q9 依據：使用者與 coding agent 需要在寫 code 前完成文件、驗證與 open loop；不需要使用者介面或應用 runtime。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：第一版只驗證文件生成與 doctor 訊號，UI、native shell、API service、admin workflow 都會增加不必要 runtime 邊界。
- 何時重新評估：若需要互動式 onboarding、hosted doctor dashboard、或多使用者管理功能，再評估 web app / management system。
- Decision status：active
- Evidence：SRC-001, SRC-002, REQ-001@1, REQ-002@1
- Nearest alternative：hosted governance dashboard
- Review trigger：event-only when onboarding becomes interactive or governance state must be shared remotely

## 明確不做

- 不提供 app runtime。
- 不提供產品功能範例。
- 不宣稱外部採用。

## 驗收者

- Repo maintainer runs `node scripts/doctor.mjs --json examples/template-adoption/base-minimal`.

## 完成標準

- doctor JSON status is `ready`.
