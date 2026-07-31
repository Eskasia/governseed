# TECH_STACK.md

## 技術路線決策

- 決策模式：user-declared route
- 唯一主路線：server-rendered web dashboard with a token-driven component layer
- 選擇理由：第一版風險是狀態表示不一致，必須讓顏色、字級、間距集中在一組 token，由既有後端直接渲染，不引入額外狀態同步層。
- 排除路線：不採原生 App、桌面 shell、小程序、單頁重前端框架，因為誤讀問題出在視覺規範而非互動複雜度，換 runtime 只會增加遷移風險。
- 後期風險：token 若只落在文件而未落在程式碼，畫面會再次分歧；第三方元件庫預設樣式會覆蓋 token。
- 重評估條件：若調度流程改為行動端優先，或需要即時協作游標，再重新評估。
- 新技術引入 gate：引入任何 UI component library 或 CSS 框架前，必須先在 DESIGN_SYSTEM 記錄它與現有 token 的對應與衝突。
- Decision status：active
- Evidence：SRC-301, SRC-302, REQ-301@1, REQ-302@1
- Nearest alternative：single-page front-end framework with a design-system package
- Review trigger：event-only when mobile-first dispatch or real-time collaboration becomes required

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Server-rendered templates plus CSS custom properties | project pinned | Tokens apply without a client build step | SPA framework |
| Backend | Existing order service | unchanged | This project does not change business logic | New BFF layer |
| Database | Existing operational store | unchanged | No schema change in scope | New read model |
| Main framework / SDK | Project template engine | project pinned | Already owned by the team | Component library |
| Package manager | Project standard | project pinned | No new toolchain introduced | Alternative registry |
| Deployment | Existing internal release pipeline | unchanged | Dashboard ships with the service | Separate static host |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record the browser versions used for the desktop and tablet design review.

## Constraints

- Every color, spacing, and radius value used in a screen must come from a declared token.
