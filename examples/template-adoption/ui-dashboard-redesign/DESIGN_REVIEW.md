# DESIGN_REVIEW.md

## 基本資訊

- 檢查日期：2026-07-31
- 檢查 URL / 路徑：本機 `npm run dev` 的 `/queue`、`/orders/SYN-0042`、`/exceptions`
- 檢查者：design-owner-role、operator-role
- 對照視覺目標：既有三個畫面的合成截圖樣本

## Desktop 檢查

- [x] 頁面可正常載入
- [x] 核心流程可操作（不只是靜態）
- [x] console 無 error
- [x] 文字無溢出、重疊、遮擋
- [x] 間距、對齊符合設計規範
- 備註：以 seeded synthetic 兩百列資料集操作，佇列一屏可見 26 列，符合 UI_SPEC 的密度目標。

## Mobile 檢查

- [x] 響應式佈局正確
- [x] 觸控目標 ≥ 44px
- [x] 無水平捲動
- [x] 鍵盤彈出不遮擋 input
- 備註：<768px 依 SPEC 非目標，僅顯示改用桌面裝置的說明頁；檢查在 1024px 平板寬度完成，動作選單觸控目標為 44px。

## 狀態覆蓋

| 狀態 | 已檢查 | 結果 | 備註 |
|---|---|---|---|
| loading | [x] | pass | 骨架保留欄寬，切換篩選時無版面跳動 |
| empty | [x] | pass | 顯示目前篩選條件與清除篩選，無插畫 |
| error | [x] | pass | 行內錯誤條保留既有列，重試可用 |
| disabled | [x] | pass | 無權限的批次改派降低對比並顯示原因 |
| focus | [x] | pass | 鍵盤可走完佇列到 Drawer，focus ring 2px 未被移除 |

## Side-by-side Critique（有視覺目標時）

| 維度 | 差異描述 | 嚴重度 | 狀態 |
|---|---|---|---|
| layout | 新版佇列外框留白 24px，舊版訂單詳情無外框留白 | 中 | 已修 |
| spacing | 舊版異常清單列高 36px，新版統一 40px | 中 | 已修 |
| typography | 舊版訂單詳情標題級距較大，新版收斂為三個級距 | 低 | 已修 |
| color | 舊版警示在兩個畫面分別是橙色與黃色，新版統一 `--color-warning` | 高 | 已修 |
| assets | 舊版空狀態有插畫，新版移除 | 低 | 已修 |
| interaction | 舊版訂單詳情 hover 換字色，新版只換底色 | 中 | 已修 |
| data realism | 審查資料為 seeded synthetic 訂單，非生產記錄 | 低 | 保留 |

## 視覺質感判斷

- 是否仍像 AI 模板：否
- 理由：沒有等寬卡片牆、沒有漸層、沒有插畫；密度與欄位取捨來自既有畫面的實際使用，狀態色收斂到三個色相且每個都對應一個可判讀的處置動作。

## 結論

- [x] 可上線
- [ ] 需要修正（見上方待修項）
- [ ] 需要重新設計
