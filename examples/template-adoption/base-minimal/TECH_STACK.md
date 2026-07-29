# TECH_STACK.md

## 技術路線決策

- 決策模式：user-declared route
- 唯一主路線：Node.js CLI and markdown template generator
- 選擇理由：專案目標是產生治理文件與執行 doctor 檢查，Node.js 可直接支撐跨平台 CLI、JSON profile、fixture smoke，不需要 app runtime。
- 排除路線：不採 web app、mobile app、backend API、database service，因為 base fixture 沒有人機 UI、資料持久化或網路服務需求。
- 後期風險：若 CLI 行為擴張成互動式產品，單檔腳本和 markdown template 可能不足以支撐狀態與 UI。
- 重評估條件：需要 hosted dashboard、多使用者狀態、遠端 API、或互動式 wizard 時重新評估。
- 新技術引入 gate：新增框架、SDK、provider 或資料庫前，必須證明它直接改善 init / doctor / fixture 驗證，且不把 starter 變成 runtime framework。
- Decision status：active
- Evidence：SRC-001, SRC-002, REQ-001@1, REQ-002@1
- Nearest alternative：hosted governance dashboard
- Review trigger：event-only when remote shared state or interactive onboarding becomes an acceptance requirement

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | n/a | n/a | No user-facing UI in base fixture | Website |
| Backend | Node.js scripts | >=20 | Cross-platform CLI and validator scripts | Shell scripts |
| Database | n/a | n/a | No persistent runtime state | SQLite |
| Main framework / SDK | Node.js standard library | >=20 | Avoid dependency burden for starter smoke | CLI framework |
| Package manager | npm | bundled with Node.js | Existing script runner | pnpm |
| Deployment | n/a | n/a | Source repo and local scripts only | Hosted service |

- Node.js: >=20

## Scripts

- init: `node scripts/init.mjs`
- doctor: `node scripts/doctor.mjs`
- validate: `node scripts/validate-starter.mjs`

## Services

- None.

## Constraints

- No package dependencies are required for this fixture.
- No application runtime is generated.
- No external credentials are used.
