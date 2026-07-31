# MACOS_RELEASE_CHECKLIST.md

## App Identity

- App name:
- Bundle ID:
- Fixed app path:
- Signing identity:
- TeamIdentifier:

## Entitlements

| Entitlement | Required | Notes |
|---|---|---|
| com.apple.security.app-sandbox |  |  |
| com.apple.security.automation.apple-events |  |  |
| com.apple.security.device.audio-input |  |  |
| com.apple.security.device.camera |  |  |

## TCC Permissions

| Permission | Required | Reset command | Verification | Notes |
|---|---|---|---|---|
| Accessibility | [ ] | `tccutil reset Accessibility <bundle-id>` |  |  |
| ScreenCapture | [ ] | `tccutil reset ScreenCapture <bundle-id>` |  |  |
| Input Monitoring | [ ] |  |  |  |
| Automation | [ ] |  |  |  |
| Apple Events | [ ] |  |  |  |

## Sandbox Status

- Sandbox enabled: yes / no
- Required sandbox exceptions:

## Build & Sign

- [ ] Bundle ID is fixed and does not change between builds
- [ ] App launches from a fixed path (not DerivedData / Downloads)
- [ ] Signed with a fixed Apple Development certificate
- [ ] `codesign -dv --verbose=4` passes
- [ ] `codesign --display -r -` shows the correct requirement

## Verification Commands

```bash
# confirm bundle id
mdls -name kMDItemCFBundleIdentifier ~/Applications/<AppName>.app

# confirm signature
codesign -dv --verbose=4 ~/Applications/<AppName>.app 2>&1 | egrep 'Identifier|TeamIdentifier|Authority'

# confirm Gatekeeper
spctl -a -vvv ~/Applications/<AppName>.app
```

## Package & Distribution

- Packaging method: zip / dmg / App Store
- Notarization status: not submitted / in progress / passed / failed
- DMG tool: `sindresorhus/create-dmg` or another

## Pre-release Checklist

- [ ] TCC permissions still work after a reset and re-grant
- [ ] TCC does not repeatedly invalidate after a rebuild
- [ ] Notarization passed (when required)
- [ ] Gatekeeper prompt tested in a clean environment
- [ ] First-launch behavior is correct
- [ ] Known limitations are recorded
