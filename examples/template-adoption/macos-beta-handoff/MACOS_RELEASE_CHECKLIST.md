# MACOS_RELEASE_CHECKLIST.md

## App Identity

- App name: ExampleMenuBar
- Bundle ID: com.example.menubar.beta
- Fixed app path: `/Applications/ExampleMenuBar.app`
- Signing identity: Apple Development (beta channel), Developer ID Application (external beta channel)
- TeamIdentifier: `EXMPL12345` (synthetic; the codesign output is authoritative for the real value)

## Entitlements

| Entitlement | Required | Notes |
|---|---|---|
| com.apple.security.app-sandbox | no | The menu bar app needs Accessibility, which is unavailable under sandbox |
| com.apple.security.automation.apple-events | no | This release does not drive other apps |
| com.apple.security.device.audio-input | no | No audio recording feature |
| com.apple.security.device.camera | no | No camera feature |

## TCC Permissions

| Permission | Required | Reset command | Verification | Notes |
|---|---|---|---|---|
| Accessibility | [x] | `tccutil reset Accessibility com.example.menubar.beta` | Re-grant after reset and check that the global hotkey recovers | Required for the global hotkey |
| ScreenCapture | [x] | `tccutil reset ScreenCapture com.example.menubar.beta` | Re-grant after reset and take one screenshot | Required for window capture |
| Input Monitoring | [ ] | `tccutil reset ListenEvent com.example.menubar.beta` | not applicable | This release does not intercept keyboard events |
| Automation | [ ] | `tccutil reset AppleEvents com.example.menubar.beta` | not applicable | This release does not drive other apps |
| Apple Events | [ ] | `tccutil reset AppleEvents com.example.menubar.beta` | not applicable | Same as above |

## Sandbox Status

- Sandbox enabled: no
- Required sandbox exceptions: not applicable; the reason sandbox is off is recorded in the `SPEC.md` non-goals

## Build & Sign

- [x] Bundle ID is fixed and does not change between builds
- [x] App launches from a fixed path (not DerivedData / Downloads)
- [x] Signed with a fixed Apple Development certificate
- [x] `codesign -dv --verbose=4` passes
- [x] `codesign --display -r -` shows the correct requirement

## Verification Commands

```bash
# confirm bundle id
mdls -name kMDItemCFBundleIdentifier /Applications/ExampleMenuBar.app

# confirm signature
codesign -dv --verbose=4 /Applications/ExampleMenuBar.app 2>&1 | egrep 'Identifier|TeamIdentifier|Authority'

# confirm Gatekeeper
spctl -a -vvv /Applications/ExampleMenuBar.app
```

## Package & Distribution

- Packaging method: dmg
- Notarization status: in progress (the beta status is recorded in `OPEN_LOOPS.md`)
- DMG tool: `sindresorhus/create-dmg`, run only after the app is signed

## Pre-release Checklist

- [x] TCC permissions still work after a reset and re-grant
- [x] TCC does not repeatedly invalidate after a rebuild
- [ ] Notarization passed (when required)
- [x] Gatekeeper prompt tested in a clean environment
- [x] First-launch behavior is correct
- [x] Known limitations are recorded: beta channel only, not published to the App Store
