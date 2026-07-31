# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-301 | completed | REQ-301@1 | AC-301 | Compare the status token mapping across the three rebuilt screens. |
| TASK-302 | completed | REQ-302@1 | AC-302 | Walk each screen through loading, empty, and error with seeded synthetic data. |
| TASK-303 | completed | REQ-303@1 | AC-303 | Scan the rebuilt screens for literal color, spacing, and radius values. |

## 任務：從截圖萃取設計規範

- 輸入：既有畫面截圖、UI_SPEC、DESIGN_SYSTEM
- 可用工具：screenshot inspection、contrast checker、token draft file
- 預期輸出：填好的 DESIGN_SYSTEM，含不一致處與紅線
- 驗證方式：每條規則指出它來自哪個既有畫面，並標出既有畫面彼此矛盾的地方
- 不做事項：直接改動既有畫面、引入新元件庫

## 任務：重做三個核心畫面

- 輸入：UI_SPEC、DESIGN_SYSTEM、既有 API 回應樣本
- 可用工具：專案樣板引擎、token 檔、seeded synthetic fixtures
- 預期輸出：dispatch queue、single order、exception handling 三個畫面
- 驗證方式：AC-301 與 AC-303 的 token 檢查，加上三種狀態各自可到達
- 不做事項：改後端 API、加新業務欄位

## 任務：設計審查與狀態覆蓋

- 輸入：DESIGN_REVIEW、重做後的三個畫面
- 可用工具：desktop 與 tablet 瀏覽器、鍵盤導覽、synthetic 資料集
- 預期輸出：填好的 DESIGN_REVIEW，含 side-by-side 差異與結論
- 驗證方式：狀態覆蓋表每列都有結果，結論欄勾選其一
- 不做事項：以截圖代替實際操作、用真實訂單資料做審查

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-301 | AC-301 | REQ-301@1 | check:synthetic-status-token-parity | passing | 2026-07-31 |
| EVD-302 | AC-302 | REQ-302@1 | check:synthetic-state-coverage-walk | passing | 2026-07-31 |
| EVD-303 | AC-303 | REQ-303@1 | check:synthetic-literal-value-scan | passing | 2026-07-31 |
