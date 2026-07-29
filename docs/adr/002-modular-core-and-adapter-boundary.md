# ADR-002: Modular Core and External Translation Boundary

## Status

Accepted for Milestone 1 on 2026-07-29 by the user's implementation request.

## Context

The starter already generates governance documents and thin runtime
entrypoints, validates governed projects locally, and keeps runtime proof
separate from governance-effectiveness claims. Decision deliberation, role
assignment, future policy compilation, and future policy attestation need a
stable data boundary without turning the repository into an agent runtime,
orchestrator, marketplace, desktop application, or hosted control plane.

Milestone 1 depends on the privacy-safe `SRC → REQ → AC → TASK → EVD` work in
PR #7. Its feature branch is based on
`codex/public-promotion-readiness@e458c017468dbf4f9329ea51df4f1f5ad319c6b6`
without merging or copying that branch into another existing PR.

## Decision

Use a Modular Monolith Core with external translation layers.

The local core owns:

- `init`, `doctor`, `assess`, `deliberate`, `roles`, and `pack` CLI contracts;
- closed JSON Schemas and deterministic semantic validation;
- project-local normalized artifacts;
- pure risk, deliberation-trigger, role-selection, permission-ceiling, and
  doctor rules;
- migration and compatibility behavior.

An Adapter——把中立治理資料轉換成特定工具格式的薄層；不得重複核心決策邏輯或執行 Agent。

Adapters may translate a neutral plan, result, role catalog, or future policy
manifest. They cannot make the underlying decision, grant authority, execute
an agent, access provider credentials, or silently weaken unsupported
controls.

A Policy Compiler——將已確認的風險、專案規則與治理 Pack，轉換成各 Agent 工具可讀設定的純本地編譯器。

An Attestation——比對宣告政策、編譯輸出與可觀察目標設定是否一致；不代表 Agent Runtime 一定遵守該政策。

A Governance Pack——可選的流程、規則與檢查集合；只能增加限制或檢查，不能擴張既有權限。

The Policy Compiler and Attestation are designed now but not implemented in
Milestone 1. Provider-specific policy adapters, catalog adapters, and
deliberation adapters remain external. Live model execution, OCI containment,
credential proxying, and real paired evaluation remain experimental and are
not dependencies of the core CLI.

The repository remains a single package. A package or repository split is
considered only when an adapter requires an independent release cycle,
dependency set, or version contract.

## Data and Privacy Boundary

Committed project state is JSON and Markdown under `.agent-governance/`.
`.agent-governance/local/` is ignored and reserved for raw deliberation,
provider receipts, and other non-evidence local material. Core commands do not
read raw provider sessions, cookies, credentials, or user-global settings.

Committed artifacts may contain normalized requirements, bounded synthesis,
opaque public/source pointers, hashes, statuses, and non-sensitive evidence.
They may not contain raw prompts, raw model output, provider traces, absolute
home paths, credentials, cookies, or secret-bearing URLs. Default redaction is
`metadata-only`.

## Consequences

- The core stays dependency-free on Node.js 20 standard-library APIs.
- One semantic owner implements each decision and permission rule.
- Adapters remain replaceable and can truthfully report unsupported controls.
- No database, daemon, hosted service, provider SDK, or workflow executor is
  added.
- Some future integrations require a separate package because the core will
  not absorb provider automation or target-specific dependencies.

## Alternatives Considered

### Monorepo now

Rejected. No Milestone 1 adapter has an independent release or dependency
requirement yet.

### Put provider and role-catalog logic directly in the core

Rejected. It would duplicate decision rules, expand the credential/network
boundary, and couple local governance validation to unstable external tools.

### Hosted policy service or graph database

Rejected. Stable IDs and references are sufficient for the Evidence Graph——由穩定 ID 與引用構成的邏輯證據圖；使用 JSON／Markdown 與 doctor 驗證，不新增圖資料庫。

## Reopen Conditions

Reopen before moving a decision rule into an adapter, adding a runtime
dependency, writing user-global settings, introducing remote state, claiming
runtime enforcement, or splitting the package/repository.
