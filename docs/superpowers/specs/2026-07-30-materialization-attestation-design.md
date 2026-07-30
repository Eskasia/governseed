# Target Materialization and Project-Layer Attestation Design

**Date:** 2026-07-30

**Status:** Phase-one design, frozen for review. No implementation exists yet.

**Plan:** `docs/superpowers/plans/2026-07-30-milestone-3-materialization-attestation-plan.md`
(scopes B, C, D)

**Boundary ADR:** `docs/adr/005-target-materialization-and-attestation-boundary.md`

**Frozen inputs, not modified by this design:** `docs/adr/004-risk-to-policy-compiler.md`
and `docs/research/2026-07-29-codex-policy-capability-matrix.md`.

---

## 1. Objective

Add two commands to the existing CLI:

```text
agent-governance materialize <project> --target codex [--dry-run] [--json]
agent-governance attest <project> --target codex [--json]
```

`materialize` writes one project-local Codex-native configuration file from an
already compiled policy. `attest` reads that file back, compares it against the
policy and the materialize receipt, and reports a level that is deliberately
below any runtime-enforcement claim.

`compile` is unchanged. It still produces only the three GovernSeed artifacts and
still leaves `.codex/config.toml` absent.

## 2. Official Source Register

Every mapping row below cites one of these. Read date 2026-07-30 (Asia/Taipei).
Web documentation exposes no repository commit SHA, so the same caveat as the
capability matrix applies: a future change must re-check current docs.

`developers.openai.com/codex/<page>` returns HTTP 308 to
`learn.chatgpt.com/docs/<page>`, so the host the frozen matrix cites is still the
canonical one and both spellings resolve to the same document.

| Key | Source |
|---|---|
| S1 | Configuration reference — https://learn.chatgpt.com/docs/config-file/config-reference.md |
| S2 | Advanced configuration — https://learn.chatgpt.com/docs/config-file/config-advanced.md |
| S3 | Agent approvals & security — https://learn.chatgpt.com/docs/agent-approvals-security.md |
| S4 | Rules — https://learn.chatgpt.com/docs/agent-configuration/rules.md |
| S5 | Permissions — https://learn.chatgpt.com/docs/permissions |
| S6 | Managed configuration — https://learn.chatgpt.com/docs/enterprise/managed-configuration |
| M | `docs/research/2026-07-29-codex-policy-capability-matrix.md` (frozen, in-repo) |
| A4 | `docs/adr/004-risk-to-policy-compiler.md` (frozen, in-repo) |
| I30001 | openai/codex issue 30001, OPEN, opened 2026-06-25, "Repo-local .codex/config.toml sandbox_mode is ignored in Codex App" |
| I8714 | openai/codex issue 8714, CLOSED, opened 2026-01-04, "Per-project config ignored; session forced to approval_policy=on-request + sandbox=workspace-write (CODEX_SANDBOX=seatbelt)" |

### 2.1 Verified target facts

- The project configuration file is `.codex/config.toml` inside the repository.
  Codex walks from the project root to the current working directory and loads
  every `.codex/config.toml` it finds; the file closest to the working directory
  wins for a key defined more than once. [S2]
- Project `.codex/` layers load only for a trusted project. For an untrusted
  project Codex ignores project-local config, hooks, and rules; user and system
  layers are unaffected. [S2]
- Precedence, lowest to highest: system defaults, user `~/.codex/config.toml`,
  profile file selected by `--profile`, project `.codex/config.toml` (closest
  wins), then command-line flags and `--config` overrides. [S2]
- Keys Codex ignores in project-local `.codex/config.toml`, with a startup
  warning, are a closed list: `openai_base_url`, `chatgpt_base_url`,
  `apps_mcp_product_sku`, `model_provider`, `model_providers`, `notify`,
  `profile`, `profiles`, `experimental_realtime_ws_base_url`, `otel`. [S2]
- `sandbox_mode` — "Sandbox policy for filesystem and network access during
  command execution", values `read-only`, `workspace-write`,
  `danger-full-access`. [S1]
- `sandbox_workspace_write.writable_roots` — `array<string>`, "Additional
  writable roots when sandbox_mode = \"workspace-write\"". [S1]
- `sandbox_workspace_write.network_access` — `boolean`, "Allow outbound network
  access inside the workspace-write sandbox". [S1] Independently corroborated by
  M line 64.
- Documented subkeys of `sandbox_workspace_write`: `writable_roots`,
  `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp`. [S1]
- `approval_policy` — values `untrusted`, `on-request`, `never`, or a granular
  object form `{ granular = { sandbox_approval, rules, mcp_elicitations,
  request_permissions, skill_approval } }`. [S1] `untrusted` runs only known-safe
  read operations automatically and requires approval for state-mutating or
  externally-executing commands; `on-request` asks for sandbox escalations,
  network access, and side-effecting tool calls; `never` disables approval
  prompts. [S3]
- Sandbox and approval policy are two separate layers that work together; the
  sandbox decides what is technically possible, approval policy decides when
  Codex must ask. [S3]
- Command rules: "Rules are experimental and may change." Project-local rules
  live under `<repo>/.codex/rules/` and load only when the project `.codex`
  layer is trusted. A rule returns `allow`, `prompt`, or `forbidden`, and the
  most restrictive matching decision wins. [S4]
- `web_search` — values `disabled`, `cached`, `indexed`, `live`; and
  `tools.web_search` — `boolean` or an object with `context_size`,
  `allowed_domains`, `location`. [S1]
- An organization-managed `requirements.toml` layer exists and can add
  restrictions that user configuration should not broaden. [S5]
- `projects.<path>.trust_level` — "Mark a project or worktree as trusted or
  untrusted (`\"trusted\"` | `\"untrusted\"`). Untrusted projects skip
  project-scoped `.codex/` layers, including project-local config, hooks, and
  rules." The page does not state which layer holds the key; user-level
  configuration is `~/.codex/config.toml`. [S1]
- `allowed_sandbox_modes` — `array<string>`, "Allowed values for `sandbox_mode`."
  A managed layer can therefore reject a `sandbox_mode` value GovernSeed writes,
  including a restrictive one. [S1]

### 2.2 Managed requirement layers, verified

The locations and precedence of the admin layer are documented, so this design
treats the managed layer as a known and cited hazard rather than an unknown.

Admin requirement sources, lowest to highest precedence [S6]:

```text
1. system requirements.toml
     Unix     /etc/codex/requirements.toml
     Windows  %ProgramData%\OpenAI\Codex\requirements.toml
2. enterprise-managed requirements delivered in the cloud config bundle
3. legacy managed_config.toml
     Unix     /etc/codex/managed_config.toml
     non-Unix ~/.codex/managed_config.toml
4. macOS managed preferences (MDM), preference domain com.openai.codex,
     keys config_toml_base64 and requirements_toml_base64
```

"Higher-precedence layers override ordinary scalar and list values from lower
layers." [S6]

Admins can also deny reads directly: "Admins can deny reads for exact paths or
glob patterns with `[permissions.filesystem]`. Users can't weaken these
requirements with local configuration", with the example
`deny_read = ["/**/*.env", "~/.ssh"]`. [S6]

Every one of those four locations is outside the project root, so `materialize`
must never read or write them, and `attest` cannot observe the composed result.
What changes is the honesty of the wording: the caveat now names real paths and
cites a precedence rule instead of asserting that the layer is undocumented.

### 2.3 Permission profiles are the newer model, and they do not compose

- "Beta. Permission profiles are under active development and may change." [S5]
- Built-in profiles: `:read-only`, `:workspace`, `:danger-full-access`. [S5]
- Custom profiles use `default_permissions = "<name>"` plus
  `[permissions.<name>.workspace_roots]`, `[permissions.<name>.filesystem]`
  (for example `":minimal" = "read"`), `[permissions.<name>.filesystem.":workspace_roots"]`,
  `[permissions.<name>.network]` with `enabled`, and
  `[permissions.<name>.network.domains]`. [S5]
- "Permission profiles do not compose with the older sandbox settings. Configure
  either `default_permissions` and `[permissions]`, or `sandbox_mode` /
  `sandbox_workspace_write`, but not both." [S5]
- "For Codex 0.138.0 or later, prefer [permission profiles] with
  `allowed_permission_profiles` and managed `default_permissions`. Use
  `allowed_sandbox_modes` only for legacy deployments." [S6]
- `allowed_permission_profiles`: "When present, the table is the complete list of
  allowed profiles. It allows profiles set to `true` and denies profiles omitted
  or set to `false`." [S6]

Three consequences, none of which is optional:

1. Read scope **is** expressible in Codex, through
   `[permissions.<name>.filesystem]` and admin `deny_read`. This design must not
   claim that no read-scope surface exists.
2. Writing `sandbox_mode` and `[sandbox_workspace_write]` is the **legacy** path
   for Codex 0.138.0 and later. Section 2.5 records why this milestone still uses
   it and states plainly that this is not a claim about the platform's direction.
3. Because the two models do not compose, writing `sandbox_mode` into a project
   where a permission profile is configured produces a configuration the target
   documents as invalid. Section 5.3 turns that into a fail-closed preflight.

### 2.4 BLOCKED items

Two items remain BLOCKED. A third was resolved by the managed-configuration and
permissions documentation on 2026-07-30 and is now a cited known limitation. A
BLOCKED item degrades a claim; it is never worked around and never guessed from
model memory.

| ID | State | Question | Consequence |
|---|---|---|---|
| BLOCKED-1 | narrowed | Whether a **project-scoped** `.codex/config.toml` may define `default_permissions` or `[permissions.<name>.*]`. [S5] documents the profile syntax and [S6] documents the admin form, but project-layer availability is NOT STATED in [S1], [S2], or [S5]. | `filesystem.project-read` stays `deferred`. The reason is now precise: a read-scope surface **does** exist, but its project-layer availability is undocumented, it is labelled Beta, it does not compose with the surface this milestone writes, and A4 independently rejects depending on permission profiles. |
| BLOCKED-3 | retained, stronger basis | Whether Codex exposes the **resolved** trust state to a project-local reader. `projects.<path>.trust_level` is documented as the way to *set* trust [S1], and user-level configuration lives in `~/.codex/config.toml`, which A4 forbids GovernSeed from reading. No key, command, or file that *reports* effective trust is documented; [S1] is NOT STATED on this. | `trustStateObserved` is hard-wired to `unknown`, which forces every `attest` result down to `materialized-unverified`. |
| ~~BLOCKED-2~~ | resolved | The location and precedence of the managed requirement layer. | Resolved by [S6]; see section 2.2. Now a cited known limitation: the four admin locations and their precedence are documented and all lie outside the project root, so the composed effective result stays unobservable to a project-local reader. |

BLOCKED-3 is the single most consequential finding in this design. Its basis
improved from "no surface was found" to "the documented mechanism sets trust in a
layer this product is forbidden to read, and no reporting surface is documented".
Section 6.3 states plainly what this milestone therefore cannot reach.

### 2.5 Why this milestone still writes the legacy sandbox surface

For Codex 0.138.0 and later the documentation prefers permission profiles with
`allowed_permission_profiles` and managed `default_permissions`, and recommends
`allowed_sandbox_modes` "only for legacy deployments" [S6].

This milestone writes `sandbox_mode` and `[sandbox_workspace_write]` anyway, for
three reasons that are scope facts, not technical claims:

1. The frozen plan fixes the target surface for this milestone, and switching to
   permission profiles would change the target selection that decision 3 locked.
2. Permission profiles are labelled Beta and "may change" [S5], which is the same
   objection A4 raised against depending on them.
3. Their project-layer availability is undocumented (BLOCKED-1), so a
   project-local writer cannot establish that a profile it writes would load.

**This is a backward-compatibility choice constrained by frozen scope. It is not
a claim that `sandbox_mode` is the target's preferred or long-term permission
surface.** The documentation says the opposite, and this design says so in the
same breath as it writes the key. Adopting permission profiles is a reopen
condition in ADR-005, not a silent future default.

## 3. `materializationStatus`

An orthogonal field, never a classification. The five matrix classifications keep
their definitions and per-control values verbatim; nothing is promoted to
`enforceable`, and no sixth classification is added.

```text
not-applicable    no native project-layer surface exists for this control
materializable    a documented native project-layer key exists and is written
deferred          a native surface exists but this milestone does not write it
```

### 3.1 Where the field lives

Only in `materialize` and `attest` output. It is **not** added to the policy
manifest or the Codex Adapter.

Reason: both are content-addressed. `policyId` is derived from the canonical
manifest seed and `policyHash` from the canonical manifest bytes, so a new
manifest field would change the identity pinned in
`tests/policy-compiler/fixtures/cross-platform-paths/case.json`
(`POL-7C0E73297E0E`) and would drift every existing fixture. A new Adapter field
would change the Adapter hash and therefore the compile transaction identity.
The plan requires that existing fixtures do not drift, so the field is computed
at materialize time from the already compiled artifacts.

### 3.2 Where the classification count comes from

Per the 2026-07-30 ruling, the compiled Codex Adapter is canonical:
`attest`'s `classificationBreakdown` counts the `support` values actually present
in it (`mappedControls[].support` plus `unsupportedControls`), not the values
transcribed into the table below. The two can differ, and the required
`classificationSourceDivergence[]` field carries the gap. Section 9.4 records the
one known divergence and the ownership split.

## 4. Codex Target Mapping

Classification column is copied verbatim from M and is not edited. `POL
capability` uses the capability keys already present in
`scripts/lib/codex-policy-adapter.mjs`.

| POL capability | Matrix classification (verbatim) | materializationStatus | Native project-layer surface | Source |
|---|---|---|---|---|
| `filesystem.project-read` | `representable-only` | `deferred` | `[permissions.<name>.filesystem]` exists and expresses read scope, but it is Beta, does not compose with the surface written here, and its project-layer availability is undocumented | S5, S6, A4, BLOCKED-1 |
| `filesystem.project-write` | `representable-only`, `runtime-evidence-required` | `materializable` | `sandbox_mode` | S1 |
| `filesystem.root-write` | `representable-only`, `runtime-evidence-required` | `materializable` | `sandbox_mode` plus `sandbox_workspace_write.writable_roots` | S1 |
| `shell.execution` | `representable-only`, `runtime-evidence-required` | `deferred` | `.codex/rules/`, documented as experimental | S4, A4 |
| `network` | `representable-only`, `runtime-evidence-required` | `materializable` | `sandbox_workspace_write.network_access` | S1, M line 64 |
| `credentials` | `unsupported` | `not-applicable` | project config cannot override provider, auth, or telemetry keys | S2 |
| `delete` | `requires-human-approval`, `runtime-evidence-required` | `materializable` (approval gate only) | `approval_policy` | S1, S3 |
| `publish` | `requires-human-approval`, `runtime-evidence-required` | `materializable` (approval gate only) | `approval_policy` | S1, S3 |
| `external-content` | `representable-only` | `deferred` | `web_search` and `tools.web_search` exist; the neutral control is about untrusted content handling, and that semantic mapping is unreviewed | S1, M line 76 |
| `generated-artifacts` | `enforceable` | `not-applicable` | GovernSeed-owned namespace; no Codex surface | M line 70 |
| `provider-retention` | `unsupported` | `not-applicable` | provider policy, not a project-config setting | M line 77 |
| `verification` | `representable-only` | `not-applicable` | no native project-layer surface for verification commands | M line 78 |

Totals: four `materializable`, three `deferred`, five `not-applicable`.

### 4.1 Value derivation, restriction-only

`materialize` emits a key only when the resulting value is at least as
restrictive as the Codex default. When a policy mode would require a more
permissive value than the default, GovernSeed writes nothing for that key and
records the control as unmaterialized with a reason code. It never writes a
permissive value.

| Policy state | Emitted | Never emitted |
|---|---|---|
| `filesystem.project-write` = `deny` | `sandbox_mode = "read-only"` | — |
| `filesystem.project-write` allows and `filesystem.root-write` = `deny` | `sandbox_mode = "workspace-write"` with `writable_roots = []` | any root outside the project |
| `filesystem.root-write` allows | nothing (would widen) | `sandbox_mode = "danger-full-access"` |
| `network` = `deny` | `sandbox_workspace_write.network_access = false` | — |
| `network` allows | nothing (writing `true` would enable egress) | `network_access = true` |
| any of `delete`, `publish`, `shell.execution` at `deny` or `require-approval` | `approval_policy = "untrusted"` | `approval_policy = "never"` |
| none of the above | `approval_policy` omitted | `approval_policy = "never"` |

`danger-full-access`, `network_access = true`, `approval_policy = "never"`, and
any `writable_roots` entry outside the real project root are unreachable by
construction. A policy that would demand one fails closed with
`MATERIALIZE_WOULD_WIDEN` rather than producing a permissive file. This is
enforced by a negative test, not by convention.

The granular `approval_policy` object form is not emitted. Only the scalar forms
are used, which keeps the TOML emitter to a closed, tiny value set.

### 4.2 Paths never written

```text
~/.codex/**          user-global (A4 rejection, still in force)
CODEX_HOME/**        user-global
requirements.toml    organization-managed layer
.codex/rules/**      experimental (A4 and S4)
AGENTS.md            canonical user-owned governance (A4 rejection)
```

The only file `materialize` writes outside the GovernSeed namespace is
`<project>/.codex/config.toml`. The only files it writes inside the GovernSeed
namespace are its own receipt. A dedicated negative test asserts that no write
occurs outside the real project root, including under a `HOME` redirected into a
temporary directory.

## 5. Materialize

### 5.1 TOML emission

Node.js has no standard-library TOML support (verified on the project's Node 26
runtime: `node:toml` is not a builtin) and `package.json` declares no runtime
dependencies. So `materialize` contains a deterministic emitter for a closed key
set: booleans, three enumerated strings, and one string array, plus one table
header `[sandbox_workspace_write]`. It is not a general TOML serializer.

Canonical output form, matching the existing artifact discipline: fixed key
order, LF endings, UTF-8, exactly one final newline, no trailing spaces, and no
wall-clock value anywhere in the file.

```toml
# GovernSeed target-materialized configuration. Do not edit by hand.
# generator = "GovernSeed"
# artifactType = "codex-project-config"
# policyId = "POL-XXXXXXXXXXXX"
# policyHash = "<64 hex>"
# materializeId = "MAT-XXXXXXXXXXXX"
# claim = "PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED"

sandbox_mode = "read-only"
approval_policy = "untrusted"

[sandbox_workspace_write]
network_access = false
writable_roots = []
```

The header is a provenance record for a human reader. It is not the ownership
proof; section 5.2 defines that.

### 5.2 Ownership

`.codex/config.toml` is a fixed path, so it cannot be content-addressed the way
`POL-<hash>.json` is. Ownership is therefore decided by byte comparison:

| Existing state | Action |
|---|---|
| absent | create, report under `filesCreated` |
| bytes exact-match the planned bytes | no write, report under `filesUnchanged` |
| bytes exact-match a `targetFiles[].sha256After` recorded in an existing GovernSeed materialize receipt in `.agent-governance/receipts/` | GovernSeed-owned from an earlier policy; replace, report under `filesUpdated` |
| anything else | `TARGET_SETTINGS_OWNER_CONFLICT`, exit 4, no write, existing bytes unchanged |

The third row is what makes re-materializing after a policy change possible
without weakening the second-run-zero-diff guarantee, and the fourth row is what
protects a user-authored file. There is no merge path and no `--force`.

Reused unchanged from the compile transaction: traversal, absolute-path, symlink
and hardlink rejection; parent-identity recheck after the final rename;
same-directory temporary staging; and receipt-last commit. A materialize output
without its matching receipt is partial output, not a completed materialization.

`--dry-run` performs every read, validation, mapping, emitter run, and ownership
check in memory and creates no directory, no temporary file, and no receipt.

### 5.3 Permission-model conflict preflight

"Permission profiles do not compose with the older sandbox settings. Configure
either `default_permissions` and `[permissions]`, or `sandbox_mode` /
`sandbox_workspace_write`, but not both." [S5] The documentation does not define
what happens when the two models are configured in *different* layers; [S2] is
NOT STATED on cross-layer interaction. Undefined behaviour is not a licence to
proceed.

So `materialize` preflights before writing anything. It scans the project-tree
`.codex/config.toml` files that Codex itself would load — from the real project
root down to the working directory [S2] — for a `default_permissions` assignment
or any `[permissions` table header. A match is
`TARGET_SETTINGS_PROFILE_MODEL_CONFLICT`, exit 4, no write.

The scan is a line-level match for those two forms. It is not a TOML parse, and it
deliberately errs toward blocking: a commented-out or string-embedded occurrence
blocks too, because a false block is recoverable and a silently non-composing
security configuration is not.

Two limits are stated rather than hidden:

- The user layer `~/.codex/config.toml` may define a permission profile.
  GovernSeed must not read it (A4), so that conflict is undetectable and becomes a
  required `precedenceCaveat` entry.
- A managed layer may set `allowed_permission_profiles`, which switches the client
  to the profile model wholesale [S6]. All four managed locations are outside the
  project root, so this is also undetectable and also a caveat.

### 5.4 Receipt

Path `.agent-governance/receipts/MAT-<12 uppercase hex>.json`, written last.
`materializeId` is `MAT-` plus the first 12 uppercase hex characters of the
canonical transaction identity digest. `materializedAt` exists only in the
receipt, mirroring `compiledAt`; no wall clock enters any hashed content.

Schema `schemas/materialize-receipt.schema.json`, closed (`additionalProperties:
false`), required fields:

```text
schemaVersion            integer, const 1
materializeId            ^MAT-[0-9A-F]{12}$
policyId                 ^POL-[0-9A-F]{12}$
policyHash               ^[0-9a-f]{64}$
target                   enum ["codex"]
dryRun                   boolean
trustStateObserved       enum ["unknown"]
targetFiles[]            path, sha256Before (null when absent), sha256After
materializedControls[]   controlId, capability, mode, classification,
                         materializationStatus, nativeKeys[], emittedValue
unmaterializedControls[] controlId, capability, materializationStatus,
                         reasonCode, source
ownership                generator "GovernSeed", artifactType
                         "codex-project-config"
status                   enum ["target-materialized", "dry-run"]
```

`unmaterializedControls` must contain every `not-applicable` and `deferred`
control. An `unsupported` control is never silently dropped; that is asserted by
the partial-support fixture.

`trustStateObserved` is a single-value enum in this schema on purpose. Widening
it later requires a schema change and therefore a review.

## 6. Attest

### 6.1 What it compares

Three-way: the compiled policy and Adapter, the materialize receipt, and the
bytes currently at `<project>/.codex/config.toml`.

The comparison is byte and hash based. `attest` does not parse TOML. Because
`materialize` owns the whole file, recomputing sha256 and comparing it to the
receipt's `sha256After` is sufficient to detect any edit, and it removes the need
for a parser the project has no dependency budget for.

### 6.2 `trustStateObserved`

Semantics: whether GovernSeed has actually observed that the target treats this
project as trusted, which determines whether the project `.codex/` layer loads at
all [S2].

Values: `trusted`, `untrusted`, `unknown`. Only `unknown` is reachable in this
milestone and the receipt schema admits only `unknown`, because BLOCKED-3 found
no official surface exposing trust to a project-local reader. GovernSeed never
infers trust from the file's existence, from a successful write, or from the
absence of an error. There is no flag to assert it.

### 6.3 Levels and the downgrade rule

```text
project-layer-observed     the project-layer file matches policy and receipt AND
                           trustStateObserved is trusted
materialized-unverified    the file matches, but trust is unknown or untrusted
```

The level field is a closed schema enum of exactly those two strings.
`observed`, `effective-observed`, and `runtime-evidenced` are unrepresentable,
not blacklisted, so no code path can produce them.

Downgrade rule: `trustStateObserved !== 'trusted'` forces `materialized-unverified`.
The rule is applied after all comparisons and cannot be overridden by any flag,
environment variable, or configuration value. `attest --level <anything>` is a
usage error; the level is computed, never requested.

**Stated plainly:** because BLOCKED-3 makes `trustStateObserved` always
`unknown`, the only level `attest` can emit in this milestone is
`materialized-unverified`.

`project-layer-observed` is therefore labelled **schema-reserved**: it exists in
the enum so a future trust-observation design does not need a breaking schema
change, and it is not a target state this milestone is trying to reach. Every
place the level appears — schema description, `attest --help`, the README evidence
table, and docs/enforcement-boundary.md — must carry that label, so no reader can
mistake an unreachable state for the normal outcome.

Two tests enforce the label rather than trusting the prose: one asserts that no
combination of governed input, target state, flag, or environment variable
produces `project-layer-observed`, and one asserts that the string appears in
`attest` output only when `trustStateObserved` is `trusted`, which is currently
unconstructible.

The plan's §C3 example output shows `level: "project-layer-observed"` together
with `trustStateObserved: "unknown"`, which its own §C4 downgrade rule forbids.
The downgrade rule wins and the example is illustrative only; section 10 records
it.

### 6.4 Output contract

Schema `schemas/attest-output.schema.json`, closed, required fields:

```text
schemaVersion         integer, const 1
level                 enum ["project-layer-observed", "materialized-unverified"]
trustStateObserved    enum ["trusted", "untrusted", "unknown"]
target                enum ["codex"]
policyId, policyHash, materializeId
declared              integer, count of policy controls
materialized          integer
projectLayerObserved  integer
classificationBreakdown  object keyed by the five matrix classifications,
                      counted from the compiled Adapter (ruling, section 10.1)
classificationSourceDivergence[]  controlId, adapterValue, matrixValue, note;
                      may be empty, but never omitted
materializationBreakdown object keyed by the three materializationStatus values
drift[]               controlId or path, reason, expectedHash, observedHash
precedenceCaveat[]    string, minItems 1
knownLimitations[]    controlId, note, source; minItems 1
claim                 const "PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED"
```

`precedenceCaveat` and `knownLimitations` are required with `minItems: 1`, so an
empty array is a schema failure, covered by a dedicated fixture.

`claim` is a schema `const` and a module-level frozen constant. No branch,
option, or interpolation can change it.

Baseline `precedenceCaveat` content:

```text
The command line and --config overrides sit above the project layer. [S2]
A .codex/config.toml nearer the working directory overrides this file. [S2]
The project layer loads only for a trusted project; trustStateObserved is
  unknown, and trust is set through projects.<path>.trust_level in a layer
  GovernSeed must not read. [S1, S2]
Managed requirement layers may add restrictions from /etc/codex/requirements.toml,
  %ProgramData%\OpenAI\Codex\requirements.toml, a cloud config bundle, legacy
  managed_config.toml, or macOS MDM preferences. All four are outside the project
  root, so their composed effect is unobservable here. [S6]
allowed_sandbox_modes in a managed layer may reject the sandbox_mode value written
  here, including a restrictive one. [S1, S6]
The user layer or a managed allowed_permission_profiles setting may switch the
  client to permission profiles, which do not compose with the sandbox settings
  written here; GovernSeed cannot read either location. [S5, S6]
```

Baseline `knownLimitations` content:

| controlId | note | source |
|---|---|---|
| `POL-SHELL-EXECUTION` | Command rules are experimental and govern commands outside the sandbox; not written. | S4 |
| `POL-FILESYSTEM-PROJECT-READ` | A read-scope surface exists as `[permissions.<name>.filesystem]`, but it is Beta, does not compose with the sandbox settings written here, and its project-layer availability is undocumented. | S5, S6, BLOCKED-1 |
| `POL-CREDENTIALS` | Project config cannot override provider, auth, or telemetry keys. | S2 |
| `POL-EXTERNAL-CONTENT` | Web-search keys exist but the mapping from untrusted-content handling to them is unreviewed. | S1 |
| all `materializable` controls | For Codex 0.138.0 and later the documentation prefers permission profiles and recommends the sandbox-mode surface only for legacy deployments; this milestone writes the legacy surface by frozen scope, not by platform preference. | S5, S6 |
| all `materializable` controls | A written project-layer value is reported as ignored on some Codex surfaces. | I30001, I8714 |

The last two rows are why `materializationStatus` never implies effectiveness. One
is drawn from the target's own documentation and one from its issue tracker.

### 6.5 Drift

Any of the following is drift, produces a non-zero exit, and never rewrites the
file:

| Condition | Reason code |
|---|---|
| current bytes differ from receipt `sha256After` | `TARGET_SETTINGS_EDITED_OUTSIDE_GOVERNSEED` |
| file absent but a receipt exists | `TARGET_SETTINGS_REMOVED` |
| receipt `policyHash` differs from the current compiled policy | `TARGET_SETTINGS_STALE_POLICY` |
| a second `.codex/config.toml` exists nearer the working directory | `TARGET_SETTINGS_SHADOWED` |
| a project-tree config defines `default_permissions` or a `[permissions` table | `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` |

The last two rows are detectable from the project tree alone. `TARGET_SETTINGS_SHADOWED`
is a real precedence hazard under S2's closest-file-wins rule, and
`TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` is the attest-side counterpart of the
section 5.3 preflight, catching a profile added after materialization.

## 7. Error Codes

Exit codes reuse the existing space documented in `docs/policy-compiler.md`:
0 success, 1 incomplete governed input, 2 usage, 3 schema or semantic, 4
fail-closed safety or ownership, 5 bounded I/O.

| Code | Command | Exit |
|---|---|---|
| `POLICY_NOT_COMPILED` | materialize, attest | 1 |
| `MATERIALIZE_RECEIPT_MISSING` | attest | 1 |
| `CLI_TARGET_UNSUPPORTED` | both, for a non-codex target | 2 |
| `CLI_USAGE_ERROR` | both, including any attempt to pass a level | 2 |
| `MATERIALIZE_RECEIPT_INVALID` | materialize, attest | 3 |
| `ATTEST_OUTPUT_INVALID` | attest | 3 |
| `TARGET_SETTINGS_OWNER_CONFLICT` | materialize | 4 |
| `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` | materialize (preflight), attest (drift) | 4 |
| `MATERIALIZE_WOULD_WIDEN` | materialize | 4 |
| `MATERIALIZE_PATH_BLOCKED` | materialize | 4 |
| `MATERIALIZE_OUTSIDE_PROJECT` | materialize | 4 |
| `MATERIALIZE_PARTIAL_OUTPUT` | materialize, attest | 4 |
| `TARGET_SETTINGS_DRIFT` | attest | 4 |
| `TARGET_SETTINGS_SHADOWED` | attest | 4 |

`CLI_TARGET_UNSUPPORTED` and `CLI_USAGE_ERROR` reuse the codes the existing
compile usage test already pins, so `--target claude` behaves consistently across
all three commands.

## 8. ADR-004 Rejection Reasons, Point by Point

| A4 reason | This design |
|---|---|
| "loads only for trusted projects" | `trustStateObserved` is a required output field. BLOCKED-3 found no official surface exposing trust, so its value is `unknown`, which forces every result to `materialized-unverified`. Trusted is never assumed, and no flag can assert it. Section 6.2, 6.3. |
| "participates in a larger precedence model" | The ceiling is the project layer; no effective-configuration claim is made. The verified five-layer order, the closest-file-wins rule, and the unobservable managed layer are all required `precedenceCaveat` entries, and a nearer project file is detected as `TARGET_SETTINGS_SHADOWED`. Section 6.4, 6.5. |
| "ownership/merge semantics" | Whole-file ownership, no merge, no `--force`. Byte-exact ownership recognition, `TARGET_SETTINGS_OWNER_CONFLICT` at exit 4 with the existing file byte-identical, content-addressed receipt written last. Section 5.2. |

Two further A4 rejections remain in force and are re-asserted by negative tests:
no user-global write (section 4.2), and compilation is not combined with
attestation (three separate commands, section 1).

## 9. Scope D: Vocabulary

### 9.1 The two terms

- `adapter-materialized` — the GovernSeed Adapter JSON exists and its hash
  matches the manifest.
- `target-materialized` — the target's native project-layer settings were written
  by `materialize`.

The superseded four-level naming in `docs/policy-compiler.md` lines 334-336
(`declared`, `materialized`, `observed`, `runtime-evidenced`) becomes `declared`,
`adapter-materialized`, `target-materialized`, `project-layer-observed`.
Historical plans and specs are not rewritten; ADR-005 is the supersession record.

### 9.2 Occurrence inventory and the check's allowlist

A repository-wide search for `materializ` found four distinct meanings, so the
vocabulary-consistency check needs an explicit allowlist rather than a blanket
ban.

| Location | Meaning | Treatment |
|---|---|---|
| `README.md` line 483, `docs/policy-compiler.md` lines 171 and 335 | the ambiguous governance term | rewrite to one of the two explicit terms |
| `docs/adr/004-risk-to-policy-compiler.md` lines 67, 216, 254; `docs/research/2026-07-29-codex-policy-capability-matrix.md` lines 16, 21, 62, 70, 116 | frozen documents | allowlisted, not modified |
| `docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md`, `docs/superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md`, the 2026-07-29 plans | historical design records | allowlisted as superseded, not rewritten |
| `docs/adr/003-deliberation-and-role-assignment-model.md` line 48 | Evidence-Graph node creation, a third meaning | allowlisted, out of scope |
| `scripts/governance-impact-eval.mjs` (`materializePinnedEntries`, `materializeMirroredDirectory`) and `tests/governance-impact/runner.test.mjs` | copying pinned files into a workspace, a fourth meaning | allowlisted, unrelated to governance claims |

### 9.3 There is no root `CONTEXT.md` (ruled)

The plan names `CONTEXT.md` as the canonical owner of domain vocabulary. This
repository has no root `CONTEXT.md`. `CONTEXT.md` is a *project output* document
listed in `startup/02-required-project-docs.md` line 10, whose blank template is
`templates/fixed/CONTEXT.md` and which `init` copies into downstream projects.

Writing GovernSeed-internal vocabulary into that template would propagate it into
every downstream project's shared-language table, and the scope-A precedent
deliberately avoided `templates/fixed/` for exactly that reason. Creating a root
`CONTEXT.md` would add a root document, which the plan's non-goals forbid.

**Ruled on 2026-07-30:** ADR-005 is the canonical owner of the two terms. They
are defined in ADR-005 section 6 and used in `docs/policy-compiler.md`.
`templates/fixed/CONTEXT.md` is not modified, so no GovernSeed-internal
vocabulary propagates into downstream projects, and no root document is added.
This is a recorded deviation from the plan's wording, not an unresolved gap.

### 9.4 Divergence between the matrix and the Adapter

M line 63 classifies Shell execution as `representable-only`,
`runtime-evidence-required`, while `scripts/lib/codex-policy-adapter.mjs` line 12
sets `shell.execution` to `requires-human-approval` and only returns
`representable-only` when the mode is `deny`. This predates the current work.

**Ruled on 2026-07-30: the compiled Adapter artifact is the canonical owner of
`classificationBreakdown`.** Attestation compares artifacts that exist, so
counting a value that is not in the Adapter JSON it just read would make `attest`
assert something absent from its own evidence.

The division of ownership is therefore explicit and single-valued per artifact:

| Artifact | Canonical classification source |
|---|---|
| `attest` output `classificationBreakdown` | the compiled Codex Adapter |
| the section 4 mapping table and docs/enforcement-boundary.md narrative | the frozen matrix |

Neither side is edited. The gap is carried in a required output field,
`classificationSourceDivergence[]`, holding `controlId`, `adapterValue`,
`matrixValue`, and a note. The array may be empty but is never omitted, so a
future divergence surfaces instead of being absorbed. A test asserts that the
`shell.execution` divergence is present while both sources still disagree, which
also means the entry disappears only through a deliberate change to one of them.

Reconciling by editing the Adapter was rejected: it would change compiled bytes,
drift `compileId` and the Adapter hash, break the pinned fixture identity, and
constitute a behaviour change outside this milestone's scope.

## 10. Rulings and Remaining Open Items

### 10.1 Ruled on 2026-07-30

1. **Vocabulary owner.** ADR-005 owns `adapter-materialized` and
   `target-materialized`. `templates/fixed/CONTEXT.md` is unchanged and no root
   document is added, because this repository's `CONTEXT.md` is a downstream
   project output rather than a starter-repo file. Section 9.3.
2. **Published surface.** docs/enforcement-boundary.md is added to the
   `package.json` `files` whitelist, matching the existing treatment of
   `docs/policy-compiler.md` and the capability matrix, so a consumer of the
   published package can resolve the `source` field in `attest` output.
   Section 12.
3. **Classification owner.** The compiled Adapter artifact is canonical for
   `classificationBreakdown`; the frozen matrix stays canonical for the mapping
   table and the enforcement-boundary narrative; the gap is carried in the
   required `classificationSourceDivergence[]` field. Neither source is edited.
   Section 9.4.
4. **`project-layer-observed` ships as schema-reserved.** It stays in the enum so
   a future trust-observation design needs no breaking schema change, is labelled
   schema-reserved everywhere it appears, and is held unproducible by two tests.
   Section 6.3.

### 10.2 Resolved by further research on 2026-07-30

5. **BLOCKED-2 is closed.** The managed requirement locations and their precedence
   are documented [S6], so the caveat now names real paths instead of asserting
   that the layer is undocumented. What remains true is narrower and still
   material: all four locations lie outside the project root, so the composed
   effective result is unobservable to a project-local reader. Sections 2.2, 2.4.
6. **BLOCKED-1 is narrowed, not closed.** A read-scope surface does exist
   (`[permissions.<name>.filesystem]`, plus admin `deny_read`), so the earlier
   wording that Codex has no read-scope surface was wrong and is corrected.
   `filesystem.project-read` stays `deferred` for three cited reasons instead:
   Beta status, non-composition with the surface written here, and undocumented
   project-layer availability. Sections 2.3, 2.4.
7. **A hazard the earlier draft missed.** Permission profiles and the sandbox
   settings "do not compose" [S5], and cross-layer behaviour is undocumented.
   Writing `sandbox_mode` into a project that configures a profile would produce a
   configuration the target calls invalid. This is now a fail-closed materialize
   preflight and an attest drift reason, with the undetectable user and managed
   layers recorded as caveats. Sections 2.3, 5.3, 6.5.

### 10.3 Still open for the phase-one review

8. **The plan's §C3 example contradicts its own §C4 downgrade rule.** The example
   shows `level: "project-layer-observed"` with `trustStateObserved: "unknown"`.
   This design follows §C4, so the downgrade rule wins and the example is
   illustrative only. Section 6.3.

## 11. Test Plan

Failing tests first, red evidence captured before any implementation, per the
plan's ordering. Fixtures 1-5 and 8-11 below map to the plan's numbered list;
fixtures 6-7 belong to scope A and are already merged.

| # | Fixture | Asserts |
|---|---|---|
| 1 | `materialize-clean` | fresh project materializes; second run writes nothing and reports `filesUnchanged`; snapshot identical |
| 2 | `materialize-owner-conflict` | pre-existing non-GovernSeed `.codex/config.toml` gives `TARGET_SETTINGS_OWNER_CONFLICT`, exit 4, original bytes unchanged, no receipt |
| 3 | `materialize-partial-support` | `unsupported` and `deferred` controls appear in `unmaterializedControls` with reason codes, never silently dropped |
| 4 | `attest-drift` | hand-edited target file gives `TARGET_SETTINGS_EDITED_OUTSIDE_GOVERNSEED` and non-zero exit |
| 5 | `attest-level-ceiling` | a constructed `runtime-evidenced` or `observed` level fails schema validation |
| 8 | regression | the existing `.codex/config.toml`-absent-after-compile assertion in `tests/policy-compiler/cli-contracts.test.mjs` is unmodified and still passes |
| 9 | `trust-unknown-downgrade` | `trustStateObserved` `unknown` yields `materialized-unverified`; every attempted override path is a usage error |
| 10 | `precedence-caveat-required` | empty `precedenceCaveat` or empty `knownLimitations` fails schema validation |
| 11 | `vocabulary-consistency` | every `materializ` occurrence is one of the two explicit terms or on the section 9.2 allowlist |

Additional negative and property tests:

| Test | Asserts |
|---|---|
| no-user-global-write | with `HOME` redirected to a temporary directory, no path outside the real project root is written or read; `~/.codex` is never touched |
| restriction-only | a policy that would require `danger-full-access`, `network_access = true`, `approval_policy = "never"`, or an external writable root gives `MATERIALIZE_WOULD_WIDEN` and writes nothing |
| claim-immutable | the `claim` constant appears exactly once and no code path produces a different value |
| dry-run-zero-write | `--dry-run` leaves the snapshot identical and writes no receipt |
| receipt-last | an interrupted transaction without a receipt is reported as partial output, not success |
| crlf-lf-parity | CRLF and LF governed inputs produce byte-identical target output |
| path-traversal | symlinked, hardlinked, traversing, or absolute `.codex` paths are rejected |
| shadowed-config | a nearer `.codex/config.toml` is reported as `TARGET_SETTINGS_SHADOWED` |
| profile-model-conflict-preflight | a project-tree config containing `default_permissions` or `[permissions` blocks materialize with `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT`, exit 4, and writes nothing |
| profile-model-conflict-drift | a profile added after a successful materialize is reported by attest with the same code and a non-zero exit |
| level-unproducible | no governed input, target state, flag, or environment variable produces `project-layer-observed`; the enum still contains it |
| divergence-field-present | `classificationSourceDivergence[]` carries the `shell.execution` entry while the matrix and Adapter disagree, and the field is present even when empty |
| managed-layer-caveat | `precedenceCaveat` contains the managed-requirement, `allowed_sandbox_modes`, and permission-profile entries; removing any one fails the test |

## 12. Implementation Registration

Phase two must also update, or `npm run validate` and `npm run check` will fail:

```text
package.json          check script entries for the new lib modules; files
                      whitelist gains docs/enforcement-boundary.md per 10.1
scripts/agent-governance.mjs   command dispatch, usage text, option parsing
scripts/lib/           new codex-target-materializer and attest modules
schemas/               materialize-receipt and attest-output schemas
scripts/validate-starter.mjs   required-file lists for the new schemas and docs
docs/policy-compiler.md        non-claims section and the superseded four levels
README.md              FAQ, evidence surfaces table, claim boundaries
CHANGELOG.md           the rule-lifecycle record required by AGENTS.md
```

Per the frozen decision, the README rewrite lands in the same commit as the
`materialize` implementation and not before, because the current wording stays
true until the command exists.

## 13. Non-Goals

Unchanged from the plan: no `runtime-evidenced` level, no Agent or model
execution, no user-global or managed write, no claude or antigravity target, no
new root document, no `.codex/rules/`, no `AGENTS.md` modification, no change to
the five matrix classifications, and no effective-configuration or
trusted-project claim that has not actually been observed.
