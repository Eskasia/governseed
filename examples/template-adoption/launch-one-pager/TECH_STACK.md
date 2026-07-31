# TECH_STACK.md

## 技術路線決策

- 決策模式：user-declared route
- 唯一主路線：single static HTML page with a print stylesheet, plus a Markdown-sourced deck
- 選擇理由：讀者會轉寄連結、離線閱讀、列印成 PDF，因此輸出必須是單一自足檔案，不依賴建置服務或執行環境。
- 排除路線：不採靜態網站產生器、不採簡報 SaaS、不採 App，因為它們把一份可轉寄的檔案變成一個需要維護的服務。
- 後期風險：說明與專案文件會隨時間分歧；簡報講稿若混進投影片，會讓事實敘述難以逐條核對。
- 重評估條件：若一頁式說明不再是入口、改以試用環境為主要行動呼籲，再重新評估。
- 新技術引入 gate：引入任何建置工具或簡報平台前，必須先確認離線可讀與可列印仍然成立。
- Decision status：active
- Evidence：SRC-501, SRC-502, REQ-501@1, REQ-502@1
- Nearest alternative：static site generator with a slide plugin
- Review trigger：event-only when a trial environment replaces the one-pager as the entry point

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Hand-written HTML with an embedded stylesheet | n/a | Single self-contained file, no build step | Static site generator |
| Backend | n/a | n/a | The deliverable is a document, not a service | Content API |
| Database | n/a | n/a | No stored state | Headless CMS |
| Main framework / SDK | n/a | n/a | No framework needed for one page | Slide framework |
| Package manager | Project standard | project pinned | Only used for the Markdown-to-deck export | Alternative registry |
| Deployment | Internal static host plus a downloadable PDF | n/a | Readers open a link or a file | Presentation SaaS |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record the source commit of the project documents each export was built from.

## Constraints

- The page must render and print without network access.
- Every factual statement must resolve to a project document; nothing may be asserted only in the deliverable.
