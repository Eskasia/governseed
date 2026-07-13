# PROJECT_BRIEF.md

## 一句話

協助小型顧問團隊把客戶文件轉成可追溯的問答工作區。

## 使用者

- 顧問團隊 owner
- 顧問團隊成員

## 要解決的問題

客戶文件分散在資料夾與郵件中，團隊無法快速確認答案來源。

## MVP

- 上傳一份文件。
- 對文件提問。
- 回答必須顯示 citation。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-101 | synthetic | attestation-only | n/a | no | confirmed | product-owner-role | 2026-07-13 |
| SRC-102 | synthetic | attestation-only | n/a | no | confirmed | security-reviewer-role | 2026-07-13 |

## 產品形態決策

- 決策模式：ai-recommended route
- 第一版產品形態：fullstack AI web app
- Q1-Q9 依據：顧問 owner 需要自己點核心流程、上傳文件、登入後提問並看到 citation；資料、權限、RAG、eval、安全文件都會影響驗收。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：landing page 不能驗證問答工作區；native app 和小程序會增加平台審核與裝置邊界；純 API 無法讓 owner 直接驗收；管理系統不是第一版核心。
- 何時重新評估：若核心使用者改成外部系統、需要離線 mobile review、或 preview 驗收改成 API-only，再重新評估。
- Decision status：active
- Evidence：SRC-101, SRC-102, REQ-101@1, REQ-102@1
- Nearest alternative：API-only RAG service
- Review trigger：event-only when direct browser acceptance changes to system-to-system integration or offline review

## 明確不做

- 不做多語翻譯。
- 不做正式 billing。
- 不做跨客戶共享文件。

## 驗收者

- 團隊 owner 自己點核心流程。

## 完成標準

- 新 agent 能在 30 秒內理解方向。
- 問題、使用者、MVP 沒有混在同一句話裡。
