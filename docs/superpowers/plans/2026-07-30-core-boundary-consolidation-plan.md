# Core Boundary Consolidation Plan

**Date:** 2026-07-30

**Status:** Planned; not started

**Base:** `main@7dd7edd3494aec33d0060c0634070887fb20a524` (PR #12 merged)

**Implementation branch:** `feature/core-boundary-consolidation`

**Scope:** 範圍 A only。Target materialization、Project-layer attestation 與詞彙修正屬後續獨立 PR，見 `2026-07-30-milestone-3-materialization-attestation-plan.md`。本次不實作、不預留介面、不建立 stub。

---

## 問題陳述

原始 Milestone brief §九 Phase 5 明文規定，以下能力不得進 Core main：

- OCI Runtime Containment
- Credential Proxy
- Live paired governance evaluator

並要求「保持 experimental package 或獨立 Repo，不得阻礙 Core CLI 的一般發布」。

現況違反此邊界。以下檔案位於 main：

```text
scripts/lib/governance-impact-oci-supervisor.mjs
scripts/lib/governance-impact-oci-proxy-facade.mjs
scripts/lib/governance-impact-credential-proxy.mjs
scripts/governance-impact-uds-relay.mjs
scripts/governance-impact-oci-integration.mjs
```

且：

- `test:governance-impact` 位於預設 `npm run ci`。
- `.github/workflows/validate-starter.yml` 的必要檔案清單包含 governance-impact 相關 workflow。
- `package.json` 無 `files` 欄位，`npm pack --dry-run --json` 出貨 276 檔案 / 2,296 KB。

可量化代價：

- 該功能開發期（2026-07-26 至 07-27）返工率 69%，為專案各開發期最高。
- 受限容器環境下 `npm run ci` 有 3 項裸失敗，全部來自這組檔案，錯誤碼 `PROCESS_TREE_UNAVAILABLE`。

本 plan 執行搬遷，不新增功能。

---

## A1. 搬遷 experimental 能力出 Core release unit

### 目標結構

```text
experimental/governance-impact/
  lib/oci-supervisor.mjs
  lib/oci-proxy-facade.mjs
  lib/credential-proxy.mjs
  uds-relay.mjs
  oci-integration.mjs
  tests/
  README.md          # 說明此目錄不屬 Core release unit
```

### 規則

- Core 的 `scripts/` 不得 import `experimental/` 內任何模組。**必須新增測試強制此約束**，不得只依賴目錄慣例或 code review。
- `npm run ci` 不再包含 experimental 測試；新增獨立 `npm run ci:experimental`。
- `.github/workflows/validate-starter.yml` 只跑 Core；experimental 走獨立 workflow，且不得成為 Core PR 的必要檢查。
- `scripts/governance-impact-eval.mjs` 的離線 controls 留在 Core（純本地、無 OCI、無 credential）。僅搬遷 OCI 與 credential proxy 相關部分。
- **這是純搬遷。不得改變 experimental 程式碼的任何行為。** 搬遷過程中發現的 bug 記入 `OPEN_LOOPS.md`，不得順手修正。
- 若離線 controls 與 OCI 路徑耦合到無法乾淨切分，**停止並回報耦合點**，不得為了切分而重構。

### 驗收

- [ ] 存在一個測試，會在 Core `scripts/` import `experimental/` 時失敗。
- [ ] `npm run ci` 不再執行 OCI 或 credential proxy 測試。
- [ ] `npm run ci:experimental` 存在且可獨立執行。
- [ ] experimental 程式碼行為與搬遷前逐位元相同（以 diff 證明僅路徑與 import 變更）。
- [ ] `npm run validate` 的 release-unit 檢查不再要求 governance-impact workflow。

---

## A2. package.json 新增 files 白名單

### 變更

```json
"files": [
  "scripts/",
  "schemas/",
  "profiles/",
  "templates/",
  "startup/",
  "workflows/",
  "catalogs/",
  "prompts/",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "CHANGELOG.md"
]
```

### 驗收

- [ ] `npm pack --dry-run --json` 的 `entryCount` 與 `unpackedSize` 相對 baseline 顯著下降。
- [ ] 出貨內容不含 `tests/`、`experimental/`、`docs/`、`examples/`。
- [ ] 三個 bin 入口（`agent-governance`、`agent-governance-init`、`agent-governance-doctor`）在僅有出貨檔案的情況下仍可執行。
- [ ] 套件與 CLI 的 legacy identifier 不變（`agent-governance-starter` 套件名與既有 bin 名稱保留）。

---

## A3. 環境能力探測

### 問題

`scripts/lib/governance-impact-adapters.mjs` 的 `terminateProcessTree` 在探測 process group 失敗時直接 `fail('PROCESS_TREE_UNAVAILABLE')`。此 fail-closed 語意在生產路徑正確，但在受限容器或 rootless 環境會使測試裸失敗，無法與真實缺陷區分。

### 變更

- 在探測階段區分「能力不可用」與「清理失敗」兩種狀態。
- 生產路徑維持 fail-closed，語意不變。
- 測試層在能力不可用時轉為 SKIP with reason，明確印出原因。

### 驗收

- [ ] 於受限容器或非 root 環境執行相關測試為全綠或明確 SKIP，無裸 fail。
- [ ] 於具備完整能力的環境，原有斷言行為完全不變。
- [ ] **未刪除任何既有測試。** 以 SKIP-with-reason 取代刪除。

---

## A4. 記錄已退役分支

在 `OPEN_LOOPS.md` 新增一列（依該檔案現有欄位格式調整）：

> Antigravity `implementation-plan` / `release-handoff` skills 與 `workflows/skill-and-plugin-adoption.md` 從未併入 main。想法保留於已退役分支 `codex/github-skills-routing@2861c60`（基底 `21b7874`，2026-06-02，早於品牌改名與 PR #9／#11，main 已前進 46 個 commit）。不 rebase；若採用需以現行樹重寫。狀態：unconfirmed。

### 驗收

- [ ] `OPEN_LOOPS.md` 含該筆記錄，且 commit SHA 與基底 SHA 正確。
- [ ] `npm run validate` 與 doctor 對該檔案的既有檢查仍通過。

---

## 非目標

本 PR 明確不做：

- 任何 materialize、attest 或 target 原生設定寫入。
- experimental 程式碼的功能增強、重構或 bug 修正。
- 新增任何 root required document。
- 任何跨平台相容性以外的行為變更。
- 刪除或修改遠端分支。
- 品牌、定位或公開聲明的變更。

---

## Baseline 記錄要求

開工前先記錄並回報：

```text
git status --short --branch
git log --oneline -3
npm run ci                      # 記錄通過項目、失敗項目與失敗原因
npm pack --dry-run --json       # 記錄 entryCount 與 unpackedSize
```

預期 HEAD 為 `7dd7edd3494aec33d0060c0634070887fb20a524`。若不符，停止並回報。

---

## 驗證命令

```text
npm run check
npm run validate
npm run ci
npm run ci:experimental
npm run fixtures
node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
npm pack --dry-run --json
git diff --check
```

---

## 相容性要求

- [ ] Legacy `init` 與 `doctor` 行為不變。
- [ ] 既有 profiles 與 adoption fixtures 通過。
- [ ] Milestone 1 的 decision／role 行為通過。
- [ ] Phase 2 的 policy compiler 行為通過，包含既有的「compile 後 `.codex/config.toml` 不存在」斷言。
- [ ] runtime-proof 路徑不漂移。

---

## 建議 commit 切分

```text
refactor(core): move experimental containment out of the release unit
chore(pkg): restrict published package surface
fix(runtime): probe process-group capability before teardown
docs(loops): record retired skills-routing branch
```

---

## 完成報告格式

依既有格式輸出：Baseline／Files changed／Acceptance criteria（每項 PASS／FAIL／BLOCKED 並附命令或測試名）／Verification／Compatibility／Remaining work。

另外必須包含：

- `npm pack` 的 `entryCount` 與 `unpackedSize` 前後對比數字。
- Core → experimental import 依賴為零的證明，指出強制它的測試檔名。
- 受限或非 root 環境下 A3 的實測行為。

**不得報告為完成的情形：**

- 只有目錄搬遷但 Core 仍 import experimental。
- 只有目錄結構但無強制測試。
- 以刪除測試取代 SKIP-with-reason。
- 只有本機單平台測試卻聲稱跨平台完成。
- `npm run ci` 未全數通過。
