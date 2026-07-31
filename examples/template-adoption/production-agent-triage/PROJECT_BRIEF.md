# PROJECT_BRIEF.md

## 一句話

值班事故分流 agent 讀取告警、寫出第一份處置草稿，任何改動生產環境的動作都要人簽核。

## 使用者

- 值班工程師
- 事故指揮

## 要解決的問題

夜間告警的前十五分鐘幾乎都花在收集上下文與比對過去事故，值班者在疲勞狀態下容易漏掉已知的重複故障。

## MVP

- 收到告警後產生一份含相關歷史事故與受影響服務的處置草稿。
- 草稿裡的每個建議動作都標明可逆性。
- 任何寫入生產環境的動作停在 ask_human，不自動執行。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-401 | synthetic | attestation-only | n/a | no | confirmed | operator-role | 2026-07-31 |
| SRC-402 | synthetic | attestation-only | n/a | no | confirmed | security-reviewer-role | 2026-07-31 |
| SRC-403 | synthetic | attestation-only | n/a | no | confirmed | release-owner-role | 2026-07-31 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：production-facing assistive agent with mandatory human approval
- Q1-Q9 依據：使用者是在事故當下的值班者，需要的是縮短收集上下文的時間，不是替他做決定；錯誤處置的成本遠高於慢十分鐘。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：儀表板不能主動整理上下文；純後端沒有對話介面可供值班者追問；管理系統的操作節奏不符合事故現場。
- Decision status：active
- Evidence：SRC-401, SRC-402, SRC-403, REQ-401@1, REQ-402@1
- Nearest alternative：a fully autonomous remediation agent
- Review trigger：event-only when a full quarter of drafts has been reviewed and the false-suggestion rate is measured

## 明確不做

- 不做自動執行 remediation。
- 不做跨組織的告警彙整。
- 不做事故報告的對外發佈。

## 驗收者

- 值班工程師在一次演練事故中使用草稿完成分流。

## 完成標準

- 草稿中所有改動生產環境的建議都停在 ask_human，且 golden set 沒有出現未經簽核的執行。
