# PROJECT_BRIEF.md

## 一句話

從既有畫面截圖反推設計規範，重做一個內部訂單調度看板的前端。

## 使用者

- 調度員
- 客服值班人員

## 要解決的問題

現有看板由三年間多人各自加頁面而成，同一種狀態在不同頁面用不同顏色與字級表示，調度員在高壓時段會誤讀。

## MVP

- 從既有畫面截圖萃取一份可執行的設計規範。
- 重做調度佇列、單筆訂單、異常處理三個核心畫面。
- 每個畫面都覆蓋 loading、empty、error 三種狀態。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-301 | synthetic | attestation-only | n/a | no | confirmed | design-owner-role | 2026-07-31 |
| SRC-302 | synthetic | attestation-only | n/a | no | confirmed | operator-role | 2026-07-31 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：internal operations dashboard, desktop-first web
- Q1-Q9 依據：使用者是坐在固定工作站、同時開多個分頁的內部員工，需要的是高資料密度與狀態一致性，不是行動端觸控體驗。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：行動 App 無法承載一屏多列的調度佇列；純後端沒有解決誤讀問題；對外網站不是這批使用者的入口。
- Decision status：active
- Evidence：SRC-301, SRC-302, REQ-301@1, REQ-302@1
- Nearest alternative：keep the existing dashboard and only unify colors
- Review trigger：event-only when dispatchers start working from mobile devices or the queue moves into an external product

## 明確不做

- 不做行動端原生 App。
- 不改後端資料模型與 API。
- 不做深色模式。

## 驗收者

- 調度員以三個核心畫面完成一次完整值班流程。

## 完成標準

- 同一種訂單狀態在三個畫面用同一組 token，且 DESIGN_REVIEW 的狀態覆蓋全部檢查過。
