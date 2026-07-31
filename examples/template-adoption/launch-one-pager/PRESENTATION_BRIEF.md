# PRESENTATION_BRIEF.md

## Goal

- 讓一位沒聽過這個工具的技術決策者，在三分鐘內判斷它是否與自己相關，並知道它明確不做什麼。

## Audience

- 潛在採用者的技術決策者，會被轉寄連結、在通勤或會議空檔閱讀。
- 內部簡報者，需要一份不必臨場補充也講得完的十分鐘版本。

## Delivery Format

- PPTX / Google Slides / HTML deck / PDF / MP4 / static HTML page: 單一自足的 static HTML page 加可列印 PDF；簡報以 Markdown 匯出成 HTML deck，講稿獨立成檔。

## Style

- 直述、無形容詞堆疊；先講邊界再講能力。
- 不用漸層、不用插畫、不用未經證實的數字。

## Length

- 一頁式說明：列印為一頁 A4，約 500 字。
- 簡報：十分鐘，投影片不超過十二張。

## Content Sources

- `PROJECT_BRIEF.md`：一句話、使用者、要解決的問題、明確不做。
- `SPEC.md`：範圍、非目標、驗收標準。
- `CONTEXT.md`：共用語彙與角色邊界。
- 每條敘述在下方對照表登記來源；沒有來源的敘述不進入交付物。

### Claim-to-source Map

| Claim ID | Statement | Source document | Reviewer decision |
|---|---|---|---|
| `CLM-501` | 這個工具處理什麼問題 | `PROJECT_BRIEF.md` 要解決的問題 | approved |
| `CLM-502` | 誰是預期使用者 | `PROJECT_BRIEF.md` 使用者 | approved |
| `CLM-503` | 明確不做的三件事 | `SPEC.md` 非目標 | approved |
| `CLM-504` | 驗收標準怎麼判定 | `SPEC.md` 驗收標準 | approved |
| `CLM-505` | 名詞的定義與容易混淆處 | `CONTEXT.md` 共用語彙 | approved |

## Must Include

- 工具明確不做的事，且放在能力說明之前。
- 名詞定義，避免讀者用自己的定義套進來。
- 每張投影片的事實敘述都能在對照表找到。

## Must Not Include

- 採用數字、客戶名稱、成效宣稱，或任何暗示外部採用的措辭。
- 只存在於交付物、無法指回專案文件的敘述。
- 外部字體、追蹤腳本或任何網路依賴。

## Review Method

- 一位未參與專案的內部審閱者只讀一頁式說明，複述工具的邊界；複述錯誤即為缺陷。
- 逐條核對對照表，任何來源為空的敘述退回。
- 執行禁用宣稱掃描，命中即阻擋發佈。

## Export / Preview Path

- `exports/onepager-<source-commit>.html` 與同名 PDF。
- `exports/deck-<source-commit>.html` 與 `exports/deck-<source-commit>-notes.md`。
- 預覽方式：關閉網路後以瀏覽器開啟 HTML，並執行一次列印預覽。
