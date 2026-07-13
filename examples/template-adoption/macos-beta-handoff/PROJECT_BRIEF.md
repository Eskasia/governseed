# PROJECT_BRIEF.md

## 一句話

讓內測者驗證一個固定簽名與固定路徑的 macOS menu bar app。

## 使用者

- 內測者
- 開發者

## 要解決的問題

開發版 app 因 TCC 身分不穩，常出現重建後授權失效。

## MVP

- 提供 DMG 或 app path。
- 測 Accessibility 與 ScreenCapture 權限。
- 回報啟動與權限狀態。

## Privacy-safe source attestations

| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |
|---|---|---|---|---|---|---|---|
| SRC-201 | synthetic | attestation-only | n/a | no | confirmed | release-owner-role | 2026-07-13 |
| SRC-202 | synthetic | attestation-only | n/a | no | confirmed | tester-role | 2026-07-13 |

## 產品形態決策

- 決策模式：user-declared route
- 第一版產品形態：macOS desktop app beta handoff
- Q1-Q9 依據：驗收者需要測固定簽名、固定路徑、TCC 權限與啟動狀態；問題本身綁定 macOS permission behavior。
- 為什麼不是網站 / App / 小程序 / 純後端 / 管理系統等其他形態：web、mobile、小程序、API 都無法驗證 macOS Accessibility、ScreenCapture、bundle id、signing identity。
- 何時重新評估：若核心驗收不再依賴 macOS TCC 或需要跨平台桌面 shell，再評估 web / Electron / multi-platform app。
- Decision status：active
- Evidence：SRC-201, SRC-202, REQ-201@1, REQ-202@1
- Nearest alternative：cross-platform desktop wrapper
- Review trigger：event-only when TCC is no longer an acceptance constraint or a cross-platform shell becomes mandatory

## 明確不做

- 不做 App Store 發佈。
- 不做自動更新。
- 不做正式 notarization gate 以外的功能擴張。

## 驗收者

- 內測者回報 TESTER_HANDOFF 指定流程。

## 完成標準

- 測試者可不用讀開發文件完成測試。
