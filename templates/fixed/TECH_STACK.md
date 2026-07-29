# TECH_STACK.md

## 技術路線決策

- 決策模式：
- 唯一主路線：
- 選擇理由：
- 排除路線：
- 後期風險：
- 重評估條件：
- 新技術引入 gate：
- Decision status：
- Evidence：
- Nearest alternative：
- Review trigger：

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend |  |  |  |  |
| Backend |  |  |  |  |
| Database |  |  |  |  |
| Main framework / SDK |  |  |  |  |
| Package manager |  |  |  |  |
| Deployment |  |  |  |  |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
|  |  |  |  |

## Version Policy

-

## Constraints

-

## Rule

- 沒有某一層時填 `n/a` 並寫原因。
- 每次引入新框架、SDK、provider、資料庫、queue、agent framework 或 MCP server，都要回到本文件檢查是否符合唯一主路線。
- `Decision status` is `active` or `recheck-required`; `Evidence` contains at least one confirmed `SRC` ID and one active `REQ` revision, and exactly matches `PROJECT_BRIEF.md`.
- Record the nearest alternative and the event-only review trigger. Do not present an AI-recommended route as a user statement.
