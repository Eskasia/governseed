# macOS App Build And Release

Applies to: SwiftUI, AppKit, Tauri, Electron, menu bar apps, and any macOS app needing Accessibility / Screen Recording / Input Monitoring / Automation permissions.

## Keeping TCC Permissions Stable

macOS TCC does not key on the app name alone; it is affected by the bundle id, the app path, and the code signing requirement. Development builds most often break on ad-hoc signing, DerivedData/build paths, and old grants invalidated by re-signing.

Required:

- Fix the bundle id, for example `com.william.AppName.dev`.
- Fix the development app path, for example `~/Applications/AppName.app` or a fixed `dist/AppName.app` in the project.
- Do not test TCC from Xcode DerivedData, a temporary build directory, or a random path in Downloads.
- Sign the `.app` with a fixed Apple Development certificate; do not run `codesign -s -` every time.
- After every bundle id, signing, or path change, reset TCC and grant permission again.

## Standard Commands For Development Builds

Check the bundle id:

```bash
mdls -name kMDItemCFBundleIdentifier ~/Applications/AppName.app
```

Check the signature and Team:

```bash
codesign -dv --verbose=4 ~/Applications/AppName.app 2>&1 | egrep 'Identifier|TeamIdentifier|Authority'
codesign --display -r - ~/Applications/AppName.app
```

Find a fixed signing identity:

```bash
security find-identity -v -p codesigning
```

Re-sign with a fixed Apple Development certificate:

```bash
codesign --force --deep --options runtime --sign "Apple Development: <Name> (<TEAMID>)" ~/Applications/AppName.app
```

Reset TCC:

```bash
tccutil reset Accessibility <bundle-id>
tccutil reset ScreenCapture <bundle-id>
```

After granting, fully quit the app and reopen it; Screen Recording / ScreenCapture sometimes needs a logout or reboot to refresh completely.

## MACOS_RELEASE_CHECKLIST Required Fields

- bundle id:
- Fixed app path:
- signing identity:
- TeamIdentifier:
- entitlements:
- sandbox status:
- TCC permissions needed: Accessibility / ScreenCapture / Input Monitoring / Automation / Apple Events
- reset TCC command:
- How it launches:
- Verification steps:
- Packaging: zip / dmg / appcast / App Store
- notarization status:

## Where DMG And create-dmg Fit

`sindresorhus/create-dmg` only packages an already-built, already-signed `.app` into a `.dmg`. It cannot fix an unstable TCC identity.

Correct order:

1. Fix the bundle id, path, and signature.
2. Reset TCC, grant permission again, and verify the app's behavior.
3. archive / export the `.app`.
4. Notarize the `.app` or `.dmg`.
5. Package for distribution with `create-dmg`.
6. Test Gatekeeper, the TCC prompt, and first launch in a clean environment.

## Acceptance

- Launched from the fixed path, Accessibility / ScreenCapture status is consistent.
- After a rebuild, as long as the bundle id, path, and signing requirement are unchanged, TCC should not keep breaking.
- If the signature or bundle id changes, the document explicitly requires a TCC reset.
- Verify codesign, spctl, and notarization before release.
