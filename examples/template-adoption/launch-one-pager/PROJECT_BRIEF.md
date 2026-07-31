# PROJECT_BRIEF.md

## 一句話

為一個內部工具的對外開放，做一份能自己站得住的一頁式說明，以及一份十分鐘的簡報。

## 使用者

- 潛在採用者的技術決策者
- 內部的簡報者

## 要解決的問題

這個工具過去只有內部口耳相傳，對外沒有任何可轉寄的說明；每次介紹都要重講一次，且每個人講的邊界都不一樣。

## MVP

- 一頁式 HTML 說明，離線可讀、可列印成 PDF。
- 十分鐘簡報，投影片與講稿分離。
- 兩者的事實敘述都指回專案文件，不另立說法。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-501 | synthetic | attestation-only | n/a | no | confirmed | product-owner-role | 2026-07-31 |
| SRC-502 | synthetic | attestation-only | n/a | no | confirmed | reviewer-role | 2026-07-31 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：static one-pager plus a ten-minute deck
- Q1-Q9 依據：讀者是被轉寄連結、在三分鐘內決定要不要繼續看的技術決策者；他們需要可自己讀完的靜態文件，不是互動網站或試用環境。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：多頁網站會讓核心說明被稀釋；試用環境的門檻高於這個階段的目的；App 與後端與傳達訊息無關。
- Decision status：active
- Evidence：SRC-501, SRC-502, REQ-501@1, REQ-502@1
- Nearest alternative：a multi-page marketing site
- Review trigger：event-only when the one-pager stops being the entry point and a trial environment becomes the primary call to action

## 明確不做

- 不做多頁行銷網站。
- 不做客戶案例與採用數字。
- 不做互動 demo。

## 驗收者

- 一位未參與專案的內部審閱者只讀一頁式說明，能複述工具的邊界。

## 完成標準

- 一頁式說明與簡報的每個事實敘述都能指回專案文件，且沒有任何未經證實的採用宣稱。
