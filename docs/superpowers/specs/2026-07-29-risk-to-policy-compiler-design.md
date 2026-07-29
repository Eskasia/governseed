# Risk-to-Policy Compiler Design

**Date:** 2026-07-29

**Status:** Approved by the user's Phase 2 implementation request

**Base:** `main@95a278bd974c84832a4b3a8c9af9566f569256d4`

**Scope:** Neutral policy manifest, Codex project-local JSON Adapter, compile
receipt, and doctor integration

## Objective

Implement one local, deterministic path:

```text
risk-profile.json
+ canonical governance references
+ human-confirmed decision provenance
+ role permission ceilings
+ source-locked active Packs
→ policy manifest
→ Codex project-local Adapter
→ compile receipt
→ doctor findings
```

A Policy Compiler——將已確認的風險、專案規則、角色權限上限與 Governance
Pack，轉換成中立 policy manifest 及特定 Agent 工具的 project-local 設定。

Success means a maintainer can preview or create a canonical policy and a
Codex-specific candidate artifact without network access, model execution,
credential access, user-global writes, permission expansion, or a claim that
Codex enforced the result.

## Product Boundary

GovernSeed remains a generator and validator for governance documents,
governance data, and Agent-specific project configuration candidates.

This phase does not:

- execute Codex or any other Agent;
- call a model or Provider;
- write `.codex/config.toml`, `.codex/rules/`, `AGENTS.md`, or `~/.codex`;
- install a Plugin, Skill, Adapter package, or persona;
- read credentials, provider sessions, environment dumps, or global settings;
- auto-approve delete, publish, release, or credential use;
- add a daemon, database, hosted service, scheduler, OCI containment, or
  credential proxy;
- implement Claude or Antigravity targets;
- implement Effective Policy Attestation.

An Adapter——把中立治理資料轉換成特定工具格式的薄層；不得重複核心決策邏輯或執行 Agent。

Attestation——比對宣告政策、編譯輸出與可觀察目標設定是否一致；不代表 Agent Runtime 一定遵守該政策。

Compilation is not enforcement. An Adapter is not a runtime sandbox. A compile
receipt is not Attestation.

## Inputs and Ownership

### Required inputs

| Input | Accepted state | Compiler use |
|---|---|---|
| `.agent-governance/risk-profile.json` | Schema-valid, `assessed`, at least one active task, no `openQuestions`, and complete risk, deliberation, reason-code, and evidence fields for every active task | Primary structured risk and permission ceiling |
| `AGENTS.md` | Safe, bounded UTF-8 project file | Normalized relative reference and content hash only |
| `.agent-governance/role-assignments/*.json` | Applicable task, `assigned`, valid provenance and separation of duties | Most-restrictive granted capability ceilings and evidence duties |
| `.agent-governance/packs.lock.json` | Schema-valid explicit Pack set, including an empty set | Prevents deletion of the lock from silently disabling Pack restrictions |
| `.agent-governance/source-lock.json` | Schema-valid explicit source set, including an empty set | Prevents deletion of provenance authority from changing policy silently |

### Conditional inputs

| Input | Participates when | Compiler use |
|---|---|---|
| Pack artifacts | Their exact lock entry is active | Structured restrictions and checks |

An active decision participates only when:

- `decision.json` is valid and active;
- its result is `human-confirmed`;
- an exact `human-confirmation.json` binds the decision, plan, and result
  hashes.

Decision content is provenance only. The compiler records its stable reference
and hashes but does not translate free-text rationale into permissions.

### Explicit non-inputs

The compiler never reads:

- `.agent-governance/local/`;
- raw deliberation or full model output;
- Provider receipts, cookies, or session state;
- `~/.codex`, `CODEX_HOME`, user profiles, keychains, or environment dumps;
- unreferenced files outside the project root.

### One semantic owner

The policy manifest is the only policy owner. `AGENTS.md` remains the canonical
repository-rule owner. A role assignment describes responsibility and a
ceiling. A Pack supplies only additional restrictions/checks. The Codex
Adapter translates the resolved manifest and cannot make another decision.

Restriction decisions and modes are target-independent. The version-1
manifest is nevertheless deliberately Codex-scoped at the target annotation
boundary: `targets` contains only `codex`, and every `targetSupport` value is
the reviewed Codex classification. Another target requires a separate
versioned Schema/Adapter change.

## Input Normalization and Hashes

Each input is opened through the existing bounded governance-artifact boundary:

- descriptor-bounded read with a 1 MiB maximum;
- fatal UTF-8 decoding;
- NUL, BOM, duplicate decoded key, secret-like value, and private-content
  rejection;
- normalized query/fragment key scanning for OAuth token, secret, credential,
  cookie, session, signature, and password families;
- real project-root containment;
- absolute-path, traversal, every-component symlink, hardlink, and parent-swap
  rejection;
- canonical JSON for JSON inputs;
- UTF-8 LF normalization for the `AGENTS.md` hash;
- portable relative paths with `/` separators.

`inputHashes` is a closed, sorted array of normalized project-relative
path/full-lowercase-SHA-256 entries. It always includes both explicit Pack and
source locks, even when their sets are empty, plus every applicable Pack,
role, source-locked external role catalog, and decision record. A changed
required hash makes prior output stale.

## Policy Model

### Identity

The core serializes canonical content with sorted keys, stable array order,
UTF-8, LF, and exactly one final newline.

- `policyId`: `POL-<12 uppercase hex>`, derived from the canonical policy seed
  excluding the self-referential `policyId`.
- `compileId`: `COMPILE-<12 uppercase hex>`, derived from the stable
  transaction identity.
- Full SHA-256 values are retained for integrity checks.
- `generatedAt` is always present and `null`; the wall clock cannot change
  policy bytes.
- `compiledAt` appears only in a compile receipt.

Short IDs are discoverability labels. Integrity comparisons use the full hash.

### Manifest contract

`schemas/policy-manifest.schema.json` is a closed JSON Schema Draft 2020-12
contract with `schemaVersion: 1` and at least:

- `schemaVersion`
- `policyId`
- `revision`
- `projectId`
- `generatedAt`
- `compilerVersion`
- `inputHashes`
- `riskProfileRef`
- `sourceRefs`
- `roleAssignmentRefs`
- `enabledPacks`
- `controls`
- `targets`
- `unsupportedControls`
- `humanApprovalControls`
- `evidenceRequirements`
- `status`

`revision` is a positive policy revision recorded from the canonical compile
model. Repeating unchanged inputs does not increment it. A changed immutable
content-addressed policy receives a new ID.

`candidate` means only input-complete and locally compile-valid. `blocked` and
`needs-input` are CLI outcomes and do not produce a persisted candidate
manifest. Superseded manifests may remain as immutable history. `compiled` is
the successful CLI transaction status, not a manifest enforcement state.

### Controls

The manifest has one required closed control group for each category. Every
group contains one or more controls:

- `filesystem`
- `shell`
- `network`
- `credentials`
- `destructiveActions`
- `publishActions`
- `externalContent`
- `generatedArtifacts`
- `retention`
- `verification`

Every control contains:

- `mode`: `deny`, `require-approval`, `constrained-allow`, `allow`, or
  `advisory`;
- `source`: stable governed source references;
- `reasonCodes`: sorted stable reasons;
- `scope`: bounded, normalized scopes;
- `targetSupport`: target classification and mapped/unsupported status;
- `evidenceRequirement`: the evidence needed before a stronger claim or
  governed action.

The compiler maps only explicit structured fields. Missing structured data is
not inferred from prose. Controls without a structured grant default to the
most restrictive compatible state, or block as `needs-input` when the correct
state cannot safely be determined.

### Merge algorithm

Authority provenance is ordered:

```text
user-confirmed governance
→ assessed risk profile
→ canonical AGENTS reference
→ active human-confirmed decisions
→ role permission ceiling
→ active optional Packs
→ target defaults
```

Mode restrictiveness is:

```text
deny
→ require-approval
→ constrained-allow
→ allow
→ advisory
```

For each capability:

1. collect valid structured constraints;
2. choose the canonical record inside each source class;
3. reject duplicate, stale, ambiguous, or conflicting authority;
4. compute the most-restrictive meet across all classes;
5. intersect each role request and granted ceiling with the project result;
6. apply active Pack controls only when they preserve or narrow the result;
7. classify target support without changing the neutral mode;
8. retain unsupported controls and their evidence requirements.

A Pack or role request that attempts to widen `deny`, approval, or scope emits
`POLICY_PRIVILEGE_EXPANSION` and blocks. Source priority cannot defeat a deny.

An external selected role is revalidated against the exact source-locked
catalog. Its role ID, supported responsibility, matching task surface, and
requested capabilities must all agree with the assignment. Provenance and
license fields must remain pinned. A mismatch emits `ROLE_CATALOG_INVALID`;
malformed assignment structure is rejected before catalog path discovery.

A Pack control with `scope: TASK-*` applies only when that exact task is active.
The task scope is retained in the effective control when exactly one task is
active. Version 1 emits `POLICY_CONFLICT` when a task-scoped Pack is combined
with multiple active tasks because one aggregate control cannot safely encode
different per-task policy.

Every Pack mechanical or human-review check maps to a deterministic
`EVD-PACK-*` requirement derived from the Pack identity, version, check ID, and
check kind. The raw check IDs remain in `enabledPacks`; their evidence
requirements appear in the top-level and per-control evidence sets. This is an
obligation, not evidence that a check executed.

If the resolved `generatedArtifacts` control is `deny`, the compiler may build
a dry-run preview but a write transaction emits `POLICY_CONFLICT`. A deny is
never represented as an approval override.

## Codex Capability Contract

The capability source of truth is
`docs/research/2026-07-29-codex-policy-capability-matrix.md`.

The classification vocabulary is:

- `enforceable`: GovernSeed can mechanically enforce the compiler-local
  property claimed.
- `representable-only`: the Adapter can express guidance or a candidate
  mapping, but cannot prove Codex applied it.
- `unsupported`: the Phase 2 project-local Adapter has no truthful mapping.
- `requires-human-approval`: a person must authorize the governed action; a
  generated instruction is not approval.
- `runtime-evidence-required`: only observation or real runtime evidence can
  support an effective/enforced claim.

Codex documents OS sandboxing, approval policy, project-scoped config,
project-trust behavior, and experimental command rules. Phase 2 intentionally
does not materialize those native configuration surfaces because their
effective value depends on trust, precedence, user/admin/session settings, and
runtime behavior. That decision is conservative scope, not a claim that Codex
lacks the capabilities.

## Codex Adapter

`schemas/codex-policy-adapter.schema.json` is a closed Draft 2020-12 contract
with `schemaVersion: 1` and:

- `schemaVersion`
- `target: "codex"`
- `adapterVersion`
- `policyId`
- `policyHash`
- `generatedFiles`
- `mappedControls`
- `unsupportedControls`
- `humanReviewRequired`
- `compatibility`
- `status`

The Adapter:

- exact-matches the neutral policy ID and full hash;
- lists only project-local GovernSeed-owned files;
- references, but does not rewrite, canonical `AGENTS.md`;
- summarizes approval, prohibited-action, and verification guidance;
- leaves `verificationCommands` empty unless a future governed structured
  input supplies commands; it never invents an npm or shell command;
- records every unsupported or non-enforceable control;
- contains no complete duplicate of the neutral policy;
- contains no Agent persona, model/provider setting, credential, or global
  path.

For Phase 2, the Adapter itself is the project-local generated policy summary.
It is JSON only:

```text
.agent-governance/adapters/codex/<policy-id>.json
```

It does not create a Codex-recognized `.codex` setting. `mappedControls` means
“translated into this candidate contract,” not “loaded by Codex.”

## Compile Receipt

`schemas/compile-receipt.schema.json` is a closed Draft 2020-12 contract with
`schemaVersion: 1` and:

- `schemaVersion`
- `compileId`
- `policyId`
- `inputHashes`
- `outputHashes`
- `target`
- `dryRun`
- `filesCreated`
- `filesUpdated`
- `filesUnchanged`
- `unsupportedControls`
- `warnings`
- `compiledAt`

The persisted receipt is written last and commits a non-dry-run transaction.
Its output hashes exact-match the manifest and Adapter. `compiledAt` records
the first successful commit time; an identical rerun reuses the receipt and
reports outputs unchanged rather than rewriting time.

Dry-run returns a Schema-valid in-memory preview with `dryRun: true` and no
persisted receipt. It must not create directories or temporary files.

The receipt excludes raw prompts, absolute home paths, credential values,
environment dumps, provider sessions, private logs, and unrestricted command
output. It proves only what the local compiler wrote and hashed.

## CLI Contract

```text
agent-governance compile <project> --target codex [--dry-run] [--json]
```

The command:

1. resolves the real project root and validates bounded input paths;
2. validates the assessed risk profile and all referenced governed inputs;
3. computes the neutral restriction meet;
4. builds and Schema-validates the manifest;
5. passes the manifest to the Codex Adapter;
6. validates the Adapter and output ownership plan;
7. returns a no-write preview or commits atomically;
8. returns one closed CLI envelope.

`--json` writes exactly one JSON object to stdout. Diagnostics go to stderr and
never reflect a secret-like value.

Stable exit codes remain:

| Code | Meaning |
|---:|---|
| `0` | Success or successful dry-run |
| `1` | Governed input is incomplete (`needs-input`) |
| `2` | CLI usage error |
| `3` | Schema or semantic validation failure |
| `4` | Fail-closed safety, authority, ownership, conflict, or policy block |
| `5` | Bounded project-local I/O failure |

No output file is created for exit `1` through `5`.

## Output Transaction

The planned output set is:

```text
.agent-governance/policies/<policy-id>.json
.agent-governance/adapters/codex/<policy-id>.json
.agent-governance/receipts/<compile-id>.json
```

Before any write, the compiler:

- validates every output path and every parent component;
- rejects symlinks, hardlinks, traversal, absolute paths, and parent identity
  changes;
- checks whether an existing file is exact matching GovernSeed-owned content;
- blocks unknown ownership rather than overwriting;
- prepares the complete output-hash and rollback plan.

Writes use same-directory temporary files, restrictive modes, file sync,
parent identity recheck, and no-replace publication semantics. The receipt is
promoted last.

After all policy and Adapter promotions, the compiler revalidates their final
bytes, ownership, expected hashes, and parent identities immediately before
the receipt promotion. An unknown replacement remains untouched and prevents
the commit marker.

The shared writer rechecks every stored parent-component identity after its
final link or rename. A detected create-path swap removes only the exact
newly linked file identity. A detected replace-path swap restores the exact
pre-replacement file identity from a same-directory backup before failing.

Because outputs are content-addressed, “update” never means replacing
different bytes at the same path. Same bytes are `filesUnchanged`; different
bytes are drift or owner conflict. A failure removes only newly created,
exact-hash owned files. On a process crash, missing receipt marks prior
promotions as partial; doctor reports them. A later compile may write the
missing receipt only when the expected policy and Adapter already exact-match
the planned GovernSeed-owned bytes. It does not delete orphan output.

## Doctor Contract

New stable findings:

| Code | Normal doctor | Strict doctor |
|---|---|---|
| `POLICY_INPUT_MISSING` | warning when a compiler surface exists but active input is incomplete; no finding for a legacy project without compiler artifacts | fail |
| `POLICY_MANIFEST_INVALID` | warning | fail |
| `POLICY_CONFLICT` | warning | fail |
| `POLICY_PRIVILEGE_EXPANSION` | warning | fail |
| `POLICY_UNSUPPORTED_CONTROL` | advisory warning | advisory warning unless another required gate is missing |
| `POLICY_APPROVAL_MISSING` | warning for active publish/delete work | fail |
| `POLICY_OUTPUT_STALE` | warning | fail |
| `POLICY_OUTPUT_DRIFT` | warning | fail |
| `POLICY_SOURCE_HASH_MISMATCH` | warning | fail |
| `CODEX_ADAPTER_INVALID` | warning | fail |
| `CODEX_ADAPTER_OWNER_CONFLICT` | warning | fail |
| `CODEX_CONTROL_NOT_ENFORCEABLE` | advisory warning | advisory warning; never rewritten as enforced |
| `COMPILE_RECEIPT_INVALID` | warning | fail |
| `COMPILE_PARTIAL_OUTPUT` | warning | fail |
| `COMPILE_PATH_BLOCKED` | fatal finding and fail | fatal finding and fail |

Phase 2 does not import or verify approval evidence. `POLICY_APPROVAL_MISSING`
therefore remains present for active publish or delete work that requires
approval; the compiler never manufactures approval evidence or infers human
identity.

Legacy projects without compiler artifacts receive no new required warning.
Existing Milestone 1 findings, profiles, fixtures, init output, and runtime
proof/impact experimental packages remain compatible.

## Privacy and Security

The compiler:

- operates offline with Node.js 20 standard-library APIs;
- does not import a network or child-process execution path;
- does not inspect user-global Codex state;
- rejects secret-like values before serialization or diagnostics;
- preserves unknown target controls instead of silently dropping them;
- never treats role names, Pack metadata, or target support as authority;
- never follows symlinks or overwrites unknown owner content;
- never treats a partial transaction as a completed receipt.

The user-global boundary is mechanically enforceable by the compiler. Codex
runtime behavior is not.

## Determinism

The following are deterministic for identical canonical inputs and compiler
version:

- policy bytes and full hash;
- policy ID;
- Adapter bytes and full hash;
- compile transaction identity;
- sorted sources, roles, Packs, controls, reasons, paths, and findings;
- Windows, macOS, and Linux path normalization;
- CRLF/LF normalization.

The first receipt timestamp is operational metadata. A completed identical
transaction reuses it. Fresh receipts are not runtime evidence and are excluded
from policy identity.

## Fixtures

| Fixture | Required evidence |
|---|---|
| `low-risk-codex` | advisory/project-local write policy, compile pass, second run zero diff |
| `restricted-data-codex` | network and credential deny preserved as non-enforceable candidate mappings |
| `publish-approval-codex` | publish requires approval, guidance present, missing approval fails strict doctor |
| `malicious-pack-expansion` | Pack allow over deny blocks with `POLICY_PRIVILEGE_EXPANSION` |
| `owner-conflict` | unknown target owner blocks and original bytes remain |
| `stale-policy` | changed risk/role source yields stale/hash finding |
| `dry-run` | complete preview with no filesystem mutation |
| `cross-platform-paths` | Windows/macOS/Linux inputs produce the same canonical output |

## Test Requirements

Use `node:test` and red-green-refactor. Coverage includes:

- positive/negative contracts for all three Schemas;
- canonical serialization and content hashes;
- source priority and most-restrictive meet;
- role intersection and Pack narrowing;
- unsupported-control preservation;
- dry-run no mutation and double-run zero diff;
- owner conflict, stale source, partial cleanup, and crash-safe write order;
- traversal, symlink, hardlink, parent swap, UTF-8, CRLF, 1 MiB, and secrets;
- no network, child Agent process, `~/.codex` access, or global write;
- JSON stdout and exit codes;
- legacy init/doctor and Milestone 1 compatibility;
- existing runtime-proof/governance-impact no-drift;
- package include/exclude behavior.

## Migration and Compatibility

- Existing projects without compiler artifacts continue to initialize and pass
  doctor as before.
- Compiler directories are additive and created only by a successful
  non-dry-run compile.
- Existing `agent-governance`, `agent-governance-init`, and
  `agent-governance-doctor` identifiers remain unchanged.
- Package name, Schema version `1`, existing profiles, and runtime Adapter
  contracts remain unchanged.
- No generated Codex file is installed globally.
- A future Schema migration must be explicit; unknown versions fail closed.

## License Treatment

The Codex capability matrix paraphrases and links current official Codex
documentation. No Codex source code, proprietary configuration file, prompt,
logo, screenshot, or substantial documentation text is copied. Existing
third-party source locks and notices remain unchanged.

## Non-Goals and Future Work

Phase 3 may design Effective Policy Attestation with separate levels:
`declared`, `materialized`, `observed`, and `runtime-evidenced`. It must not
describe `observed` as runtime enforcement.

Future independent changes may add Claude/Antigravity Adapters or a reviewed
Codex-native materialization strategy. They must not duplicate core policy
logic or inherit approval from this design.

OCI containment, credential proxying, live evaluators, external model
execution, hosted policy services, and provider automation remain experimental
or separate-project work.

## Acceptance Criteria

- [ ] Exactly three new machine-readable contracts validate real behavior.
- [ ] `compile --target codex` is deterministic, offline, and project-local.
- [ ] A role or Pack cannot widen the assessed project ceiling.
- [ ] Unsupported controls survive in manifest, Adapter, receipt, and doctor.
- [ ] Codex Adapter JSON never claims that guidance is sandbox enforcement.
- [ ] `--dry-run` performs zero filesystem mutations.
- [ ] Existing unknown-owner files are never overwritten.
- [ ] Receipt-last transaction behavior is tested under failures.
- [ ] Normal and strict doctor semantics match the stable finding table.
- [ ] Eight fixtures and targeted safety/determinism tests pass.
- [ ] Existing CLI, init, doctor, fixtures, profiles, and experimental
  packages do not drift.
- [ ] Full local CI, strict fixture doctors, package dry-run, diff check, and
  Ubuntu/macOS/Windows hosted CI pass.
- [ ] No merge, release, publish, Attestation, or Phase 3 work occurs.
