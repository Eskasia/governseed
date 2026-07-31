# MACOS_RELEASE_CHECKLIST.md

## App 識別

- App 名稱：ExampleMenuBar
- Bundle ID：com.example.menubar.beta
- 固定 App 路徑：`/Applications/ExampleMenuBar.app`
- Signing identity：Apple Development（beta 通道），Developer ID Application（外部 beta 通道）
- TeamIdentifier：`EXMPL12345`（synthetic，實際值以 codesign 輸出為準）

## Entitlements

| Entitlement | 需要 | 備註 |
|---|---|---|
| com.apple.security.app-sandbox | 否 | menu bar app 需要 Accessibility，sandbox 下無法取得 |
| com.apple.security.automation.apple-events | 否 | 本版不驅動其他 app |
| com.apple.security.device.audio-input | 否 | 無錄音功能 |
| com.apple.security.device.camera | 否 | 無攝影功能 |

## TCC 權限

| 權限 | 需要 | Reset 命令 | 驗證方式 | 備註 |
|---|---|---|---|---|
| Accessibility | [x] | `tccutil reset Accessibility com.example.menubar.beta` | reset 後重新授權，觀察全域快捷鍵是否恢復 | 全域快捷鍵所需 |
| ScreenCapture | [x] | `tccutil reset ScreenCapture com.example.menubar.beta` | reset 後重新授權，觸發一次截圖 | 視窗截圖所需 |
| Input Monitoring | [ ] | `tccutil reset ListenEvent com.example.menubar.beta` | 不適用 | 本版不攔截鍵盤事件 |
| Automation | [ ] | `tccutil reset AppleEvents com.example.menubar.beta` | 不適用 | 本版不驅動其他 app |
| Apple Events | [ ] | `tccutil reset AppleEvents com.example.menubar.beta` | 不適用 | 同上 |

## Sandbox 狀態

- sandbox 啟用：否
- 需要的 sandbox exception：不適用；未啟用 sandbox 的理由記錄在 `SPEC.md` 非目標

## Build & Sign

- [x] Bundle ID 已固定，不隨 build 變動
- [x] App 從固定路徑啟動（非 DerivedData / Downloads）
- [x] 使用固定 Apple Development certificate 簽名
- [x] `codesign -dv --verbose=4` 驗證通過
- [x] `codesign --display -r -` 顯示正確 requirement

## 驗證命令

```bash
# 確認 bundle id
mdls -name kMDItemCFBundleIdentifier /Applications/ExampleMenuBar.app

# 確認簽名
codesign -dv --verbose=4 /Applications/ExampleMenuBar.app 2>&1 | egrep 'Identifier|TeamIdentifier|Authority'

# 確認 Gatekeeper
spctl -a -vvv /Applications/ExampleMenuBar.app
```

## Package & Distribution

- Package 方式：dmg
- Notarization 狀態：進行中（beta 狀態已記錄於 `OPEN_LOOPS.md`）
- DMG 工具：`sindresorhus/create-dmg`，僅在 app 已簽名後執行

## 發佈前 Checklist

- [x] TCC 權限在 reset 後重新授權仍正常
- [x] Rebuild 後 TCC 不反覆失效
- [ ] Notarization 通過（若需要）
- [x] 乾淨環境測試 Gatekeeper prompt
- [x] 第一次啟動行為正確
- [x] 已知限制已記錄：beta 通道限定，未上架 App Store
