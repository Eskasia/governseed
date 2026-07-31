# DESIGN_SYSTEM.md

## 產品判斷

- 產品氣質：安靜、密集、可掃視；工具而非展示品
- 目標用戶：調度員與客服值班人員
- 核心使用場景：值班尖峰時段連續操作四十分鐘以上
- 使用設備與壓力：固定工作站雙螢幕，時間壓力高，錯讀成本高
- 截圖 / 參考來源：既有調度佇列、訂單詳情、異常清單三個畫面的合成截圖樣本

## 視覺語言萃取

| 類別 | 從截圖觀察到的規則 | 適用場景 | 不要怎麼用 | 不一致處 |
|---|---|---|---|---|
| 色彩 | 狀態只用三個色相：中性、警示、危險 | 狀態 Badge 與列背景 | 不用色相表達優先度 | 異常清單的警示是橙色，佇列是黃色 |
| 字體 | 單一無襯線家族，三個級距 | 全站 | 不引入第二個字體家族 | 訂單詳情用了較大的標題級距 |
| 間距 | 8px 基準，表格列高 40px | 表格與表單 | 不用 5px、7px 這類非倍數值 | 異常清單列高 36px |
| 柵格 | 12 欄，桌面兩側 24px 留白 | 頁面外框 | 不做等寬三欄卡片牆 | 訂單詳情未套用外框留白 |
| 圓角 | 4px 一種 | 按鈕、輸入框、Badge | 不用膠囊形 Badge | 異常清單 Badge 為膠囊形 |
| 邊框 | 1px 中性色，只用於分隔 | 表格列、面板 | 不用邊框表達狀態 | 佇列以邊框顏色表達異常 |
| 陰影 | 僅浮層使用，一級 | Drawer、Modal、Toast | 不給靜態卡片加陰影 | 訂單詳情卡片有陰影 |
| 組件 | 表格列即操作單元，行內操作靠右 | 佇列 | 不把主要操作藏進 kebab 選單 | 異常清單主要操作在 kebab 內 |
| 互動狀態 | hover 只換背景不換字色 | 所有可點列 | 不用底線表示 hover | 訂單詳情 hover 會換字色 |
| 圖標 / 插畫 | 只用線性 icon，無插畫 | 操作按鈕 | 不用插畫填空狀態 | 空狀態出現過一次插畫 |

## 設計原則

| 原則 | 適用場景 | 不要怎麼用 |
|---|---|---|
| 同一狀態全站同一組 token | 所有顯示訂單狀態的地方 | 不因畫面不同而換色 |
| 密度優先於留白 | 佇列與清單 | 不為了呼吸感砍掉可見列數 |
| 可掃視優先於可閱讀 | 表格欄位 | 不用長句取代短標籤 |
| 錯誤不遮擋既有資料 | 取單失敗 | 不用全頁 Modal 報錯 |

## 色彩系統

| Token | 值 | 用途 | 適用場景 | 不要怎麼用 |
|---|---|---|---|---|
| `--color-bg` | `#F7F8FA` | 頁面底色 | 所有頁面外框 | 不當作卡片底色 |
| `--color-surface` | `#FFFFFF` | 面板與列 hover 底色 | 表格、Drawer | 不當作頁面底色 |
| `--color-text` | `#16191F` | 主要文字 | 內文與欄位值 | 不用於次要說明 |
| `--color-muted` | `#5B6472` | 次要文字 | 欄位標籤、時間 | 不用於主要數值 |
| `--color-border` | `#DDE1E7` | 分隔線 | 表格列、面板邊界 | 不用來表達狀態 |
| `--color-primary` | `#1F5FD0` | 主要操作與 focus ring | 主按鈕、focus | 不用於狀態 Badge |
| `--color-success` | `#1E7A4B` | 已完成狀態 | 狀態 Badge | 不用於一般成功提示以外 |
| `--color-warning` | `#A9640A` | 需注意狀態 | 狀態 Badge、警示條 | 不用橙色另做一套 |
| `--color-danger` | `#B3261E` | 異常狀態 | 狀態 Badge、錯誤條 | 不用於刪除以外的破壞性暗示 |

## 字體系統

| Token | 值 | 用途 | 適用場景 | 不要怎麼用 |
|---|---|---|---|---|
| `--font-display` | 與 `--font-sans` 同家族，600 字重 | 畫面標題 | 頁首、Drawer 標題 | 不引入第二個家族 |
| `--font-sans` | 系統無襯線堆疊 | 內文與表格 | 全站預設 | 不用於數值對齊欄 |
| `--font-mono` | 系統等寬堆疊 | 訂單編號與時間 | 需要對齊的欄位 | 不用於一般內文 |

## 間距與柵格

| Token / Rule | 值 | 適用場景 | 不要怎麼用 |
|---|---|---|---|
| Base unit | 8px | 全站 | 不出現非 4 的倍數 |
| Page padding | 24px | 桌面頁面外框 | 不隨畫面調整 |
| Section gap | 24px | 區塊之間 | 不用於表格列間 |
| Component gap | 8px | 按鈕群、Badge 群 | 不用於區塊之間 |
| Form gap | 16px | 表單欄位之間 | 不壓到 8px |
| Modal padding | 24px | Drawer 與 Modal | 不小於 16px |
| Breakpoints | 768px / 1024px | 響應式切換 | 不新增中間斷點 |

## 圓角、邊框、陰影

| Token | 值 | 適用場景 | 不要怎麼用 |
|---|---|---|---|
| `--radius-sm` | `4px` | 按鈕、輸入框、Badge | 不做膠囊形 |
| `--radius-md` | `6px` | 面板、Drawer | 不用於行內元件 |
| `--radius-lg` | `8px` | 全頁 Modal | 不用於表格 |
| `--shadow-sm` | `0 1px 2px rgba(22, 25, 31, 0.08)` | Toast | 不用於靜態卡片 |
| `--shadow-md` | `0 8px 24px rgba(22, 25, 31, 0.12)` | Drawer、Modal | 不疊加兩層陰影 |

## 核心組件規範

| Component | 結構 | 狀態 | 適用場景 | 不要怎麼用 |
|---|---|---|---|---|
| Button | 標籤加選用前置 icon | default / hover / focus / disabled / loading | 主要與次要操作 | 不用純 icon 當主要操作 |
| Input | 標籤在上、說明在下 | default / focus / error / disabled | 表單與篩選 | 不用 placeholder 取代標籤 |
| Select | 原生下拉加自訂箭頭 | default / focus / disabled | 篩選與改派 | 不做多層巢狀選單 |
| Tabs | 底線指示，最多四項 | default / active / focus | 訂單詳情分頁 | 不用 Tabs 承載主導覽 |
| Sidebar / Navbar | 左側固定導覽，寬 216px | default / active | 全站 | 不做可收合動畫 |
| Card / Panel | 白底、1px 邊框、無陰影 | default | 訂單詳情區塊 | 不加陰影做層次 |
| Table / List | 40px 列高，表頭吸頂 | default / hover / selected / empty | 佇列與異常清單 | 不做斑馬紋 |
| Modal / Drawer | 右側 Drawer 為主，Modal 僅用於確認 | default / loading | 訂單操作 | 不用 Modal 顯示長表單 |
| Toast / Alert | 右下 Toast，四秒自動關閉 | success / warning / danger | 操作結果 | 不用 Toast 報阻斷性錯誤 |
| Empty / Error / Loading | 文字加單一行動 | 三種各一 | 所有清單 | 不用插畫或轉圈遮罩 |

## 狀態規範

| State | 視覺規則 | 適用場景 | 不要怎麼用 |
|---|---|---|---|
| default | `--color-surface` 底、`--color-text` 字 | 所有元件 | 不額外加邊框 |
| hover | 底色換 `--color-surface`，字色不變 | 可點列與按鈕 | 不換字色或加底線 |
| active | 底色加深一階 | 按鈕按下 | 不用位移動畫 |
| focus | 2px `--color-primary` focus ring | 鍵盤導覽 | 不移除 outline |
| disabled | 不透明度 0.45，游標 not-allowed | 無權限操作 | 不直接隱藏 |
| loading | 骨架保留欄寬 | 清單與面板 | 不用全頁遮罩 |
| selected | 左側 3px `--color-primary` 標記 | 批次選取列 | 不用整列變色 |
| error | 行內錯誤條加重試 | 取單或送出失敗 | 不用 Modal 擋住資料 |
| success | Toast 提示，不改變列樣式 | 操作成功 | 不長駐綠色底 |
| empty | 說明目前條件加清除篩選 | 篩選無結果 | 不用插畫 |

## 圖標 / 插畫規範

- 圖標尺寸：16px 行內，20px 按鈕
- 線寬：1.5px
- 填色：不填色，僅描邊，顏色繼承文字色
- 背景：透明
- 命名：`icon-<動作或物件>`，全小寫連字號
- 適用場景：操作按鈕、狀態前置標記
- 不要怎麼用：不用 icon 單獨表達狀態，不使用插畫

## 文案語氣規範

| 場景 | 語氣 | 範例 | 不要怎麼寫 |
|---|---|---|---|
| Button | 動詞開頭，最多四字 | 改派、標記異常 | 「確定要改派嗎」 |
| Error | 說明發生什麼與下一步 | 取單失敗，請重試 | 「發生未知錯誤」 |
| Empty state | 說明目前條件 | 目前篩選沒有待處理訂單 | 「這裡空空如也」 |
| Success | 陳述結果 | 已改派 3 筆 | 「太棒了！」 |
| Helper text | 說明限制 | 備註最多 200 字 | 「請盡量簡短」 |

## 禁用規則 / 設計紅線

| 規則 | 原因 | 適用場景 | 不要怎麼用 |
|---|---|---|---|
| 不得寫入非 token 的顏色、間距、圓角值 | 值一旦散落，畫面會再次分歧 | 所有畫面 | 不以「只有這一處」為由破例 |
| 同一狀態不得跨畫面換色 | 誤讀成本高 | 狀態 Badge | 不為視覺變化調整狀態色 |
| 不得用邊框顏色表達狀態 | 既有畫面已因此不一致 | 表格列 | 不以邊框補強 Badge |
| 錯誤不得遮擋既有資料 | 值班時需要保留上下文 | 取單失敗 | 不用全頁 Modal |

## Screen Map

| Screen / Tab / Modal | 入口 | 主要操作 | 必備狀態 | 備註 |
|---|---|---|---|---|
| 調度佇列 | 側邊導覽 | 篩選、批次改派 | loading / empty / error | 桌面一屏至少 25 列 |
| 單筆訂單 Drawer | 佇列列點擊 | 改派、標記異常、寫備註 | loading / error | 不用 Modal |
| 異常清單 | 側邊導覽 | 認領、回填結果 | loading / empty / error | 與佇列共用狀態 token |
| 確認 Modal | 破壞性操作 | 確認、取消 | loading | 僅用於確認 |

## Component Inventory

| Component | 使用畫面 | Token 依賴 | Asset 依賴 | 前端備註 |
|---|---|---|---|---|
| Table | 調度佇列、異常清單 | `--color-border`、`--space-2` | 無 | 表頭吸頂 |
| Status Badge | 三個畫面 | `--color-success`、`--color-warning`、`--color-danger` | 無 | 狀態對應表在色彩系統 |
| Drawer | 單筆訂單 | `--shadow-md`、`--radius-md` | 無 | 右側固定寬 480px |
| Toast | 三個畫面 | `--shadow-sm`、`--radius-sm` | 無 | 四秒自動關閉 |
| Empty State | 佇列、異常清單 | `--color-muted` | 無 | 純文字，無插畫 |

## Asset Manifest

| File | 用途 | 尺寸 | 透明背景 | 來源 prompt / 來源 | 使用畫面 |
|---|---|---|---|---|---|
| `icon-reassign.svg` | 改派操作 | 20×20 | 是 | 專案內繪製，線寬 1.5px | 調度佇列、單筆訂單 |
| `icon-flag.svg` | 標記異常 | 20×20 | 是 | 專案內繪製，線寬 1.5px | 單筆訂單 |
| `icon-claim.svg` | 認領異常 | 20×20 | 是 | 專案內繪製，線寬 1.5px | 異常清單 |

## Design Tokens

```css
:root {
  --color-bg: #F7F8FA;
  --color-surface: #FFFFFF;
  --color-text: #16191F;
  --color-muted: #5B6472;
  --color-border: #DDE1E7;
  --color-primary: #1F5FD0;
  --color-primary-fg: #FFFFFF;
  --color-success: #1E7A4B;
  --color-warning: #A9640A;
  --color-danger: #B3261E;

  --font-display: var(--font-sans);
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --shadow-sm: 0 1px 2px rgba(22, 25, 31, 0.08);
  --shadow-md: 0 8px 24px rgba(22, 25, 31, 0.12);
}
```

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        primary: 'var(--color-primary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
};
```
