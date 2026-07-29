# TECH_STACK.md

## 技術路線決策

- 決策模式：user-declared route
- 唯一主路線：native macOS app beta package with stable bundle identity
- 選擇理由：第一版風險是 TCC、簽名與 app path 穩定性，必須用 native macOS release surface 驗證。
- 排除路線：不採 web app、iOS app、小程序、純 API、Electron，因為它們不能代表目標 TCC 行為，或會引入非必要 runtime。
- 後期風險：簽名身份、bundle id、build path、macOS 版本差異會讓 tester evidence 失真。
- 重評估條件：若測試目標改成跨平台 UI 或不再需要 TCC 權限，再重新評估。
- 新技術引入 gate：新增 packaging、notarization、自動更新或 telemetry 工具前，必須更新 MACOS_RELEASE_CHECKLIST 與 TESTER_HANDOFF。
- Decision status：active
- Evidence：SRC-201, SRC-202, REQ-201@1, REQ-202@1
- Nearest alternative：cross-platform desktop wrapper
- Review trigger：event-only when native TCC behavior stops being required or cross-platform delivery becomes mandatory

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | SwiftUI / AppKit | project pinned | Native permissions and menu bar behavior | Web app |
| Backend | n/a | n/a | Beta handoff only validates local app behavior | API service |
| Database | n/a | n/a | No persistent shared data in fixture | SQLite |
| Main framework / SDK | macOS SDK | target version in SPEC | TCC behavior matters | Electron |
| Package manager | n/a | n/a | Native project tooling owns dependencies | npm |
| Deployment | DMG / app path | current release tool | Tester handoff | zip |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record macOS version used for beta QA.

## Constraints

- Bundle id, path, and signing identity must stay stable.
