# Milestone 3 Brief v2：Core 邊界收斂 + Target Materialization + Project-Layer Attestation

> **v2 修訂記錄（2026-07-30）** —— 依 Phase 2 closeout 文件（`docs/adr/004-risk-to-policy-compiler.md`、
> `docs/research/2026-07-29-codex-policy-capability-matrix.md`、
> `docs/superpowers/plans/2026-07-29-risk-to-policy-compiler-plan.md`）修正 v1 的兩項缺陷：
>
> 1. **v1 誤述** Phase 3 路線圖「缺少 target materialization 步驟」。實際上能力矩陣已明列該步驟為
>    強化宣稱的前提。真正的缺陷是**詞彙碰撞**：原始 brief §九 的 `materialized` 指 Adapter JSON 已產生，
>    能力矩陣的 `materialization` 指寫入原生設定。兩者不同，會導致進度誤判。本 v2 新增範圍 D 修正詞彙。
> 2. **v1 映射表過度宣稱**，將 `network: deny` 與 `filesystem.root-write: deny` 標為 `enforceable`，
>    與能力矩陣的 `representable-only, runtime-evidence-required` 直接衝突，且誤用了 `enforceable`
>    的既有定義（compiler-local property，非 runtime 行為）。本 v2 §三 B2 已改寫，不新增第六種分類。
> 3. **v1 未回應 ADR 004 拒絕寫入 `.codex/config.toml` 的三項理由**，其中 precedence model 具決定性：
>    讀取 project 層設定不等於觀察 effective config。本 v2 §四 已將宣稱上限降為 project-layer。

**Date:** 2026-07-30

**Status:** Planned. 範圍 A 未開始；範圍 B/C/D 待範圍 A 合併後另開 PR。

**Base:** `main@9559773 (PR #13 merged)` (PR #12 merged)

**Implementation branch:** `feature/core-boundary-consolidation`（範圍 A）

> 承接：Milestone 1（決策與角色基礎，PR #9）、Phase 2（Risk-to-Policy Compiler，PR #11、closeout PR #12）
> 本 brief 沿用既有術語定義，不重新定義 Policy Compiler、Attestation、Adapter、Governance Pack、Deliberation、Role Assignment、Evidence Graph。
> PR 切分：範圍 A 一個 PR；範圍 B+C+D 合為第二個 PR。兩者不得混在同一個 PR。

---

## 〇、本次要解決的兩個結構性問題

**問題 A：`materialization` 是能力矩陣已列出、但尚未實作的前提步驟，且詞彙與原始 brief 碰撞。**

現況：`compile` 只寫入 `.agent-governance/adapters/codex/POL-*.json`，屬 GovernSeed 自有命名空間。ADR 004 §Alternatives Considered 明確且有理由地拒絕在 Phase 2 寫入 `.codex/config.toml`。

能力矩陣「What is required for a stronger claim」欄已指出下一步：對 File write scope 為「Materialize a reviewed native setting, resolve trust/precedence, then observe the effective setting or runtime evidence」。

因此本次不是補漏，而是**執行一項已規劃、已凍結理由、時機已到的後續步驟**，並同時修正詞彙碰撞：

| 詞 | 原始 brief §九 的意思 | 能力矩陣的意思 |
|---|---|---|
| `materialized` / `materialization` | Adapter JSON 已產生且 hash 一致 | 寫入 target 原生設定 |

只讀原始 brief 者會誤判 materialized 已達成。範圍 D 負責消除此碰撞。

**問題 B：Phase 5 禁入 Core main 的能力目前在 main、在預設 CI、在 release unit、在 npm 出貨內容中。**

現況清單：
```
scripts/lib/governance-impact-oci-supervisor.mjs
scripts/lib/governance-impact-oci-proxy-facade.mjs
scripts/lib/governance-impact-credential-proxy.mjs
scripts/governance-impact-uds-relay.mjs
scripts/governance-impact-oci-integration.mjs
```
且 `test:governance-impact` 位於預設 `npm run ci`；`package.json` 無 `files` 欄位，`npm pack` 出貨 276 檔案 / 2.3 MB。

可量化代價：該功能開發期返工率 69%（專案最高）；受限容器環境下 `npm run ci` 的 3 項失敗全部來自這組檔案。

本次執行搬遷。

---

## 一、人工決策事項（已於 2026-07-30 確認，Codex 不得再自行變更）

以下屬「改變不可逆 public API」與「改變產品定位」，依原始 brief §十一 需人工確認。三項均已確認：

**決策 1：公開聲明的變更 — 已確認改寫**
現行 README FAQ 明文：「`agent-governance compile` … does not write Codex runtime configuration」。本 Milestone 引入 `materialize` 後改寫為（保留非宣稱紀律）：
> `compile` 產生政策候選與 Adapter；`materialize` 在明確命令下寫入 project-local target 設定；`attest` 回讀比對。三者皆不構成 runtime enforcement 的證明。

**⚠ 時序約束（必須遵守）**：現行措辭在 `materialize` 實作完成前**仍然為真**。改寫必須與範圍 B 在同一個 commit 落地，不得提前。提前改寫即構成宣稱尚未存在的能力，違反原始 brief §十一「不宣稱尚未證明的能力」。

需同步更新的位置（缺一即驗收失敗）：
- `README.md` FAQ「Does `agent-governance compile` enforce policy in Codex?」
- `README.md`「Evidence surfaces」表格新增 materialize 與 observed attestation 兩列
- `README.md`「Security and claim boundaries」新增 materialize 的寫入邊界聲明
- `CHANGELOG.md`
- `docs/policy-compiler.md` 的 non-claims 段落

**決策 2：`materialize` 為獨立命令 — 已確認**
不併入 `compile`。理由有二：

1. 寫入 target 命名空間屬不同權限層級，應要求獨立、明確的使用者意圖，與既有「外部 Role Catalog 產生 Persona 必須使用獨立明確命令」的規則一致。
2. **此決策是保全既有測試契約的機制。** `tests/policy-compiler/cli-contracts.test.mjs` 現有斷言 `compile` 後 `.codex/config.toml` 不存在。因 `materialize` 為獨立命令，該斷言**維持原樣、繼續通過、不得修改**——`compile` 仍然不寫。新行為由新測試覆蓋。

**⚠ 明確禁止**：不得以「新功能需要」為由刪除、放寬或改寫該既有斷言。若實作者發現該斷言擋路，代表 `materialize` 被錯誤地耦合進 `compile`，應修正實作而非修改測試。

**決策 3：首個 materialize target — 已確認為 codex**
理由依原始 brief §十一「最小 owning intervention」：Codex Adapter 與其 `SUPPORT` 對照表已存在，缺的只是 writer；新增 claude target 需同時新增 adapter、schema、對照表與測試。claude 列為本 Milestone 的 stretch，非驗收條件。

---

## 二、範圍 A：Core 邊界收斂（已拆為獨立 plan 與獨立 PR）

**範圍 A 不在本 plan 的實作範圍內。** 它已拆出為獨立文件與獨立 PR：

> `docs/superpowers/plans/2026-07-30-core-boundary-consolidation-plan.md`
> branch `feature/core-boundary-consolidation`

**範圍 A 必須先合併，本 plan 的範圍 B／C／D 才可開工。** 理由：範圍 A 變更 `package.json` scripts、`validate-starter.mjs` 的 release-unit 清單與 CI 組成，與範圍 B 的新命令註冊位置重疊；併行會在 release-unit 檢查上互相衝突。

以下保留原始摘要供參考，實作細節以獨立 plan 為準。

### 範圍 A 摘要（僅供參考）

### A1. 搬遷 experimental 能力出 Core release unit

建立 `experimental/` 目錄，遷入：
```
experimental/governance-impact/
  lib/oci-supervisor.mjs
  lib/oci-proxy-facade.mjs
  lib/credential-proxy.mjs
  uds-relay.mjs
  oci-integration.mjs
  tests/...
  README.md   # 說明此目錄不屬 Core release unit
```

規則：
- Core 的 `scripts/` 不得 import `experimental/` 內任何模組（新增測試強制此約束）。
- `npm run ci` 不再包含 experimental 測試；新增獨立 `npm run ci:experimental`。
- `.github/workflows/validate-starter.yml` 只跑 Core；experimental 走獨立 workflow。
- 保留 `governance-impact-eval.mjs` 的離線 controls 於 Core（純本地、無 OCI、無 credential），僅搬遷 OCI 與 credential proxy 相關部分。

### A2. package.json 新增 `files` 白名單

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
  "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md"
]
```
驗收：`npm pack --dry-run --json` 的 `entryCount` 與 `unpackedSize` 相對現況顯著下降，且不含 `tests/`、`experimental/`、`docs/`、`examples/`。

### A3. 環境能力探測

`terminateProcessTree` 於無法執行 process-group 探測的環境（受限容器、rootless）改為回傳明確的 capability-unavailable 狀態，測試層面轉為 SKIP with reason，不得為裸 fail。
驗收：於 root、受限容器內執行 `npm run ci` 為全綠或明確 SKIP，無 `PROCESS_TREE_UNAVAILABLE` 裸失敗。

---

## 三、範圍 B：`materialize` 命令

### B1. 命令契約

```
agent-governance materialize <project> --target codex [--dry-run] [--json]
```

行為：
- 讀取既有 `.agent-governance/policies/POL-*.json` 與 `.agent-governance/adapters/codex/POL-*.json`。
- 只寫入 **project-local** target 設定；**絕不寫入 user-global 或 managed settings**。
- 沿用 Phase 2 既有安全機制：no-overwrite ownership check、receipt-last transaction、content-addressed ID、canonical hash。
- 目標檔案已存在且非 GovernSeed 所有 → `TARGET_SETTINGS_OWNER_CONFLICT`，exit 4，不覆寫。
- `--dry-run` 零寫入，輸出完整 diff 預覽。
- 第二次執行相同輸入產生零 diff。
- 不連網、不執行 Agent、不讀 credential、不安裝 plugin。

### B2. 映射與分類（必須服從既有能力矩陣）

**權威來源**：`docs/research/2026-07-29-codex-policy-capability-matrix.md`。本 Milestone **不得修改**該矩陣的五種分類定義，**不得新增第六種分類**，**不得將任何控制升級為 `enforceable`**。

理由：`enforceable` 在既有定義中意為「GovernSeed 可機械強制的 compiler-local 屬性」，不描述 Codex runtime 行為。寫入原生設定並不改變此定義——它產生一個**成品**，不產生一個**保證**。

改為在每個控制上新增獨立欄位，與分類正交：

```
materializationStatus:
  not-applicable    # 無原生對應表面（例：credentials）
  materializable    # 有原生對應，本次寫入
  deferred          # 有原生對應但本次不寫（例：experimental 的 .codex/rules/）
```

Codex target 對照（分類欄必須逐字沿用矩陣現有值）：

| POL capability | 矩陣既有分類 | materializationStatus | 原生表面 |
|---|---|---|---|
| `network` | `representable-only`, `runtime-evidence-required` | `materializable` | sandbox 網路設定鍵 |
| `filesystem.*-write` | `representable-only`, `runtime-evidence-required` | `materializable` | sandbox 寫入範圍設定鍵 |
| `shell.execution` | `representable-only`, `runtime-evidence-required` | `deferred` | command rules 目前為 experimental，維持 ADR 004 的拒絕 |
| `delete` / `publish` | `requires-human-approval`, `runtime-evidence-required` | `materializable`（僅 approval policy 部分） | approval policy 設定鍵 |
| `credentials` | `unsupported` | `not-applicable` | project config 無法覆寫憑證/provider 鍵 |
| 專案指令 | `representable-only` | `not-applicable` | 不得改寫 `AGENTS.md`，維持 ADR 004 的拒絕 |

### B2b. 必須回應 ADR 004 的三項拒絕理由

ADR 004 拒絕 Phase 2 寫入 `.codex/config.toml` 的三項理由，本次必須逐一處理，且處理方式須寫入新 ADR：

| ADR 004 的理由 | 本次處理 |
|---|---|
| 「loads only for trusted projects」 | `materialize` 輸出必須含 `trustStateObserved` 欄位。**若無法確認專案是否被 target 標記為 trusted，值為 `unknown`，且 attest 不得宣稱該設定生效。** 不得假設 trusted。 |
| 「participates in a larger precedence model」 | 見 §四 C2：宣稱上限降為 project-layer，不得宣稱 effective config。 |
| 「ownership/merge semantics」 | 沿用 Phase 2 既有機制：no-overwrite owner conflict、content-addressed、receipt-last。目標檔案已存在且非 GovernSeed 所有 → exit 4、byte 級不變。 |

**若實作過程發現任一理由無法妥善處理，停止並回報，不得降低標準通過。**

### B3. `materialize-receipt.schema.json`

至少包含：`schemaVersion`、`materializeId`、`policyId`、`policyHash`、`target`、`targetFiles`（路徑 + 寫入前後 sha256）、`materializedControls`、`unmaterializedControls`（含 reason code）、`ownership`、`status`。

---

## 四、範圍 C：`attest --level project-layer-observed`

### C1. 命令契約

```
agent-governance attest <project> --target codex [--json]
```

回讀 project 層 target 設定，與 POL 及 materialize receipt 三方比對。

### C2. 宣稱上限（v2 關鍵修正）

原始 brief §九 的 `observed` 定義為「可觀察 project-local target settings 一致」。依能力矩陣記載的 Codex 設定 precedence（project / user / system / command-line 多層，且 project 層僅在 trusted project 載入），**讀取 project 層檔案不等於觀察 effective config**。

因此：

- 本次可達到的最高等級命名為 **`project-layer-observed`**，不是 `observed`。
- schema 層拒絕 `observed`、`effective-observed`、`runtime-evidenced`。
- 若 `trustStateObserved` 為 `unknown`，等級進一步降為 `materialized-unverified`。
- 輸出必須含 `precedenceCaveat` 必要欄位，說明哪些層可能覆寫本設定。

### C3. 輸出契約

```json
{
  "schemaVersion": 1,
  "level": "project-layer-observed",
  "trustStateObserved": "unknown",
  "declared": 12,
  "materialized": 6,
  "projectLayerObserved": 6,
  "classificationBreakdown": {
    "representable-only": 5,
    "requires-human-approval": 2,
    "unsupported": 3,
    "enforceable": 2
  },
  "drift": [
    { "controlId": "POL-NETWORK", "reason": "TARGET_SETTINGS_EDITED_OUTSIDE_GOVERNSEED",
      "expectedHash": "...", "observedHash": "..." }
  ],
  "precedenceCaveat": [
    "user、system 與 command-line 層可覆寫 project 層設定",
    "project 層僅在專案被標記為 trusted 時載入；本次 trustStateObserved 為 unknown"
  ],
  "knownLimitations": [
    { "controlId": "POL-SHELL-EXECUTION",
      "note": "command rules 為 experimental 且僅作用於 sandbox 之外的指令，本次不寫入",
      "source": "<官方文件章節>" }
  ],
  "claim": "PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED"
}
```

### C4. 硬性紀律（必須以測試強制）

- `level` 上限為 `project-layer-observed`；schema 層拒絕更高等級。
- `claim` 硬編碼為 `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`，無任何程式路徑可改成 enforcement 宣稱。
- `precedenceCaveat` 與 `knownLimitations` 皆為必要欄位，空陣列即 schema 驗證失敗。
- `trustStateObserved` 為 `unknown` 時，等級必須自動降級，不得由使用者參數覆寫。
- 偵測到 drift 時 exit 非 0。

### C5. docs/enforcement-boundary.md

沿用既有「What it does not prove」表格風格，逐一列出每個 capability 的：矩陣分類、materializationStatus、依據的官方文件、已知繞過路徑、precedence 風險、建議的補償控制。此文件為 attest 輸出中 `source` 欄位的權威來源。

## 四之二、範圍 D：消除詞彙碰撞

**問題**：`materialized` 在原始 brief §九 與 Phase 2 能力矩陣中指涉不同事物。

**處理**：

1. 在 `CONTEXT.md`（領域詞彙的 canonical owner）新增條目，明確區分：
   - `adapter-materialized` — GovernSeed Adapter JSON 已產生且 hash 一致
   - `target-materialized` — target 原生設定已由 `materialize` 寫入
2. 更新 `docs/policy-compiler.md` 與新 ADR，凡使用該詞處改為上述兩個明確詞之一。
3. 修訂原始 Phase 3 四等級命名，於新 ADR 記錄 supersede 關係，不改寫歷史文件。

**驗收**：全庫搜尋 `materialized` 的每一處出現，皆為兩個明確詞之一，或位於標明已 superseded 的歷史文件中。

## 五、測試與驗收

先寫 failing test，再實作。至少新增 fixtures：

1. `materialize-clean` — 全新專案，materialize 成功，第二次執行零 diff。
2. `materialize-owner-conflict` — 目標設定已存在且非 GovernSeed 所有 → exit 4、不覆寫、原檔 byte 級不變。
3. `materialize-partial-support` — 政策含 `unsupported` 控制 → 明確列於輸出，不靜默略過。
4. `attest-drift` — materialize 後手動竄改 target 設定 → drift 偵測、exit 非 0。
5. `attest-level-ceiling` — 嘗試構造 `runtime-evidenced` 輸出 → schema 拒絕。
6. `core-boundary` — Core `scripts/` 不得 import `experimental/`（靜態檢查）。
7. `package-surface` — `npm pack` 的內容不得超出 `package.json` `files` 白名單解析出的集合；白名單外的任何項目即失敗。**（2026-07-30 修訂）** 原措辭為「不含 `tests/`、`experimental/`、`docs/`、`examples/`」，與範圍 A 已落地的白名單直接衝突：白名單刻意出貨 `tests/policy-compiler/fixtures/`、`tests/policy-compiler/fixture-contracts.test.mjs` 與五個 `docs/` 路徑，其中數個由 `tests/brand/brand-compatibility.test.mjs` pin 住。裁決為改寫本行、保留白名單；`experimental/` 與 `examples/` 不在白名單內，故仍受此 fixture 保護。
8. `compile-still-does-not-write` — **既有的 `tests/policy-compiler/cli-contracts.test.mjs` 中「compile 後 `.codex/config.toml` 不存在」的斷言必須維持原樣且繼續通過。** 本項為迴歸保護，任何對該斷言的修改即驗收失敗。
9. `trust-unknown-downgrade` — `trustStateObserved` 為 `unknown` 時 attest 等級自動降為 `materialized-unverified`，且無參數可覆寫。
10. `precedence-caveat-required` — `precedenceCaveat` 為空陣列時 schema 驗證失敗。
11. `vocabulary-consistency` — 全庫 `materialized` 用詞檢查（範圍 D 驗收）。

必須涵蓋：決定性、雙跑零 diff、Windows/macOS/Linux 路徑、CRLF/LF、symlink、path traversal、無網路呼叫、無 user-global 寫入、legacy init/doctor 相容、既有 fixtures 不漂移。

完成前執行：`npm run check`、`npm run validate`、`npm run ci`、`npm run fixtures`、所有 strict fixture doctor、`npm pack --dry-run --json`、`git diff --check`。

**不得因測試失敗而**：刪測試、放寬 schema、降低 severity、修改 fixture 使錯誤消失、把 BLOCKED 改為 PASS、以 mock 取代真實邏輯。

---

## 六、明確不做（本 Milestone 非目標）

- `runtime-evidenced` 等級。
- 執行任何 Agent 或外部模型。
- 寫入 user-global 或 managed settings。
- claude / antigravity target 的 materialize（列為 stretch，非驗收條件）。
- 新增任何 root required document。
- 對 experimental 目錄的功能增強（只搬遷，不改行為）。
- 任何形式的 runtime enforcement 宣稱。
- 寫入 `.codex/rules/`（command rules 仍為 experimental，維持 ADR 004 的拒絕）。
- 改寫或附加 `AGENTS.md`（維持 ADR 004 的拒絕）。
- 修改 `docs/research/2026-07-29-codex-policy-capability-matrix.md` 的五種分類定義。
- 宣稱 effective config 或 trusted-project 狀態，除非已實際觀察到。

---

## 七、完成報告格式

沿用既有格式（Baseline / Product decisions / Source adoption / Files changed / Acceptance criteria / Verification / Compatibility / Remaining work），並額外回報：

- `npm pack` 出貨檔案數與大小的前後對比。
- Core → experimental 的 import 依賴為零的證明。
- `attest` 對每個 capability 的 support 分級表，及各級的實測控制數。
- 受限容器環境下 `npm run ci` 的執行結果。

**不得報告為完成的情形**：只有 schema 沒有行為測試；只有 materialize 但無 owner-conflict 保護；只有 attest 輸出但無 drift 偵測測試；只有搬遷但 Core 仍 import experimental；只有本機單平台測試卻聲稱跨平台完成。
