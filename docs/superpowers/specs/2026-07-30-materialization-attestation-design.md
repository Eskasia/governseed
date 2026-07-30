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
  restrictions that user configuration should not broaden. [S5, S6] Its locations
  and precedence are in section 2.2, which cites S6 for the specific paths.
- `projects.<path>.trust_level` — "Mark a project or worktree as trusted or
  untrusted (`\"trusted\"` | `\"untrusted\"`). Untrusted projects skip
  project-scoped `.codex/` layers, including project-local config, hooks, and
  rules." The page does not state which layer holds the key; user-level
  configuration is `~/.codex/config.toml`. [S1]
- `allowed_sandbox_modes` — `array<string>`, "Allowed values for `sandbox_mode`."
  A managed layer can therefore reject a `sandbox_mode` value GovernSeed writes,
  including a restrictive one. [S1]
- Model selection is a documented rule, not undefined behaviour: "If
  `sandbox_mode` appears in any loaded config file, you pass `--sandbox`, or the
  selected config profile sets `sandbox_mode`, Codex uses those older sandbox
  settings instead of `default_permissions`." [S5]
- Under the default `workspace-write` sandbox policy, "`.codex` is protected as
  read-only when it exists as a directory", alongside `.git` and `.agents`, and
  "Protection is recursive, so everything under those paths is read-only." [S3]
  The permissions page states the same: "Codex's safeguards ensure subfolders such
  as `.codex/` and `.git/` within a workspace root are read-only while the rest of
  the folder is writable." [S5] No mechanism to lift the protection is documented;
  [S3] is NOT STATED on both lifting it and on whether such a write triggers an
  approval or escalation path.

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

Four consequences, none of which is optional:

1. Read scope **is** expressible in Codex, through
   `[permissions.<name>.filesystem]` and admin `deny_read`. This design must not
   claim that no read-scope surface exists.
2. Writing `sandbox_mode` and `[sandbox_workspace_write]` is the **legacy** path
   for Codex 0.138.0 and later. Section 2.5 records why this milestone still uses
   it and states plainly that this is not a claim about the platform's direction.
3. The two models do not compose, and which one applies is decided by a documented
   selection rule rather than left undefined: `sandbox_mode` in **any** loaded
   config file wins over `default_permissions` [S5]. Section 5.3 turns that into a
   fail-closed preflight, and section 5.3.1 explains why the rule makes the
   preflight a safety gate rather than a tidiness check.
4. Because `.codex` is a recursively read-only protected path under the default
   `workspace-write` policy, `materialize` cannot be assumed to work from inside a
   standard Codex session. Section 5.5 records that constraint.

### 2.3.1 Project-layer availability is documented only negatively

No page states, for any key, that it *may* be set in a project-scoped
`.codex/config.toml`. What is documented is the inverse: project-local config is an
ordinary config layer [S2], and a closed ten-key list is ignored there [S2].
Availability is therefore an inference by exclusion in every case.

This design relies on that inference for the four keys it writes — `sandbox_mode`,
`sandbox_workspace_write.writable_roots`,
`sandbox_workspace_write.network_access`, and `approval_policy`. Consistency then
forbids using the opposite standard elsewhere: `default_permissions` and
`[permissions.<name>.*]` are equally absent from the ignore list and are equally
documented as ordinary `config.toml` keys [S1], so **this design does not claim
that permission profiles are unavailable at the project layer.**

An earlier draft used "project-layer availability is undocumented" as the primary
reason to defer `filesystem.project-read`. That reason was inconsistent with the
inference the same document relies on to write four other keys, and it is
withdrawn. Section 2.4 records the replacement reason, which is scope, not
knowledge.

### 2.4 BLOCKED items

A BLOCKED item degrades a claim; it is never worked around and never guessed from
model memory. Two items remain BLOCKED, one of them newly found. Two earlier
items are retired: one resolved by documentation, one withdrawn as a bad reason.

| ID | State | Question | Consequence |
|---|---|---|---|
| BLOCKED-3 | retained, stronger basis | Whether Codex exposes the **resolved** trust state to a project-local reader. `projects.<path>.trust_level` is documented as the way to *set* trust [S1], and user-level configuration lives in `~/.codex/config.toml`, which A4 forbids GovernSeed from reading. No key, command, or file that *reports* effective trust is documented; [S1] is NOT STATED. | `trustStateObserved` is hard-wired to `unknown`, which forces every `attest` result down to `materialized-unverified`. |
| BLOCKED-4 | new | Whether **creating** a `.codex` directory that does not yet exist is permitted under the default `workspace-write` policy. [S3] states the protection applies "when it exists as a directory" and is recursive, and is NOT STATED on creation. | `materialize` must not assume either answer. Section 5.5 treats a write failure under `.codex` as a first-class, named outcome rather than an unexpected I/O error, and no document may imply that a Codex session can materialize its own project configuration. |
| ~~BLOCKED-1~~ | withdrawn | Whether a project-scoped `.codex/config.toml` may define `default_permissions` or `[permissions.<name>.*]`. | Withdrawn as a reason. Project-layer availability is documented only negatively for *every* key (section 2.3.1), so treating profiles as unavailable while writing four other keys on the same inference was inconsistent. `filesystem.project-read` stays `deferred` on scope grounds instead, recorded below. |
| ~~BLOCKED-2~~ | resolved | The location and precedence of the managed requirement layer. | Resolved by [S6]; see section 2.2. Its residue is not a knowledge gap and is renamed accordingly: **managed and other non-project precedence is external and non-observable from project-local evidence.** The four admin locations and their precedence are documented, and all four lie outside the project root, so no amount of further research makes the composed effective result readable from here. It is a cited known limitation, not a BLOCKED item. |

Replacement reason for deferring `filesystem.project-read`, which is a scope
decision rather than a knowledge gap:

1. The frozen plan selects the sandbox surface for this milestone, and the
   documented selection rule means writing `sandbox_mode` and adopting profiles are
   mutually exclusive, so switching would be a target-surface change, not an
   addition. [S5]
2. Permission profiles are labelled "Beta … and may change". [S5]
3. A4 independently rejects depending on permissions profiles.

BLOCKED-3 is still the most consequential finding. Its basis improved from "no
surface was found" to "the documented mechanism sets trust in a layer this product
is forbidden to read, and no reporting surface is documented". Section 6.3 states
plainly what this milestone therefore cannot reach.

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
3. The documented selection rule makes the two mutually exclusive [S5], so this is
   a choice between surfaces, not an incremental addition that could be made later
   in the same milestone.

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
| `filesystem.project-read` | `representable-only` | `deferred` | `[permissions.<name>.filesystem]` exists and expresses read scope, but it is Beta and mutually exclusive with the surface written here, so adopting it is a target-surface change outside this milestone | S5, S6, A4, section 2.4 |
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

The invariant is stated against the key's own value space, not against its
default: **every value `materialize` emits is the most restrictive value that key
admits.** When a policy mode would require anything looser, GovernSeed writes
nothing for that key and records the control as unmaterialized with a reason code.

| Key | Emitted value | Why it is the strictest the key admits |
|---|---|---|
| `sandbox_mode` | `read-only` or `workspace-write` | the three documented values are `read-only`, `workspace-write`, `danger-full-access` in increasing permissiveness; `danger-full-access` is unreachable by construction [S1] |
| `sandbox_workspace_write.writable_roots` | `[]` | the key adds writable roots, so the empty array adds none [S1] |
| `sandbox_workspace_write.network_access` | `false` | boolean whose `true` value allows outbound egress [S1] |
| `approval_policy` | `untrusted` | of the three scalar values, `untrusted` requires approval for the widest set of operations and `never` for none [S1, S3] |

This formulation replaces an earlier one — "at least as restrictive as the Codex
default" — which was both weaker and uncited: this document records value enums
for these keys but no default value for any of them, so the earlier invariant
rested on a baseline it never established. The strictest-value formulation needs no
default, and it holds whatever the defaults turn out to be.

`sandbox_mode = "workspace-write"` is the one emitted value that is not the
absolute minimum of its enum. It is emitted only when the policy permits project
writes, so `read-only` would contradict the policy rather than restrict it; the
row below states that condition explicitly.

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

#### 4.1.1 A `deny` mapped to `approval_policy` is a gate, not a denial

Row six is the one place where the emitted key does not carry the control's mode.
`approval_policy = "untrusted"` makes Codex *ask*; a person who approves the prompt
performs the action. A `deny` control is therefore not denied by this file, and the
Codex Adapter already says so — `codexSupportForControl` downgrades `deny` on
`delete`, `publish`, and `shell.execution` to `representable-only`
(`scripts/lib/codex-policy-adapter.mjs:23-31`), and the Adapter's own guidance says
"A denied action remains denied and cannot be enabled by approval."

The three-value `materializationStatus` enum cannot express that, and a prose
qualifier in a design table is not machine-readable. So `materializedControls[]`
carries a required companion field:

```text
modeCoverage    enum ["full", "approval-gate-only"]
```

`approval-gate-only` is required for every control whose only emitted key is
`approval_policy` while its mode is `deny`. `full` is required everywhere else. A
receipt that reports a `deny` control as `materialize`-covered without
`approval-gate-only` fails schema validation, and section 11's
`deny-is-not-denied` test pins it.

This is the one field that keeps `materializable` from meaning more than it does.
Without it, a consumer reading the receipt sees a `deny` control marked
`materializable` and concludes the denial was written into the target.

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

`[sandbox_workspace_write]` is emitted only when `sandbox_mode =
"workspace-write"`. Under `read-only` the table has no documented effect [S1], and
emitting a dead table would put bytes in the file that no reviewer can act on. The
example above shows both keys together for illustration; the two forms are the
only two the emitter produces, and both are pinned by the `materialize-clean`
fixture.

**Identity is derived from inputs, not outputs.** `materializeId` appears inside
the emitted file, so it cannot depend on that file's hash:

```text
materializeId = "MAT-" + first 12 uppercase hex of
                sha256Canonical({ policyId, policyHash, target, plannedKeys })

plannedKeys   = the canonical sorted key/value set about to be emitted,
                before rendering
```

This is a deliberate deviation from the compile precedent, and the reason is that
the precedent does not apply. `compileIdFor(policyId, outputHashes)`
(`scripts/lib/policy-compiler-project.mjs:542-548`) hashes its output artifacts,
which is sound there because neither the manifest nor the Adapter embeds its own
`compileId`. The target file does embed its own `materializeId`, so hashing the
output would make the identity depend on a value the output contains. An earlier
draft of this section left the digest input undefined and would have been read as
following the precedent; it is defined here instead.

Nothing is lost by the deviation. The receipt still records
`targetFiles[].sha256After`, so the emitted bytes remain verifiable exactly, and
`plannedKeys` is a total function of the compiled policy, so two runs over an
unchanged policy still produce one identity and one byte sequence.

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

The third row also states this design's trust boundary, so it is written down
rather than implied. Ownership recognition trusts the contents of
`<project>/.agent-governance/receipts/`. Receipts are content-addressed but
unsigned, so anyone who can write into that directory can craft a receipt
recording the sha256 of a user-authored `.codex/config.toml` and thereby cause
`materialize` to replace it. GovernSeed does not defend against that and does not
claim to: `.agent-governance/` is the evidence root, and an actor who controls the
evidence root controls every claim this product makes, not just this one. What the
fourth row protects against is the ordinary case — an unrelated pre-existing file,
a hand edit, a different tool's output — which is the case that actually occurs.

Reused unchanged from the compile transaction: traversal, absolute-path, symlink
and hardlink rejection; parent-identity recheck after the final rename;
same-directory temporary staging; and receipt-last commit. A materialize output
without its matching receipt is partial output, not a completed materialization.

`--dry-run` performs every read, validation, mapping, emitter run, and ownership
check in memory and creates no directory, no temporary file, and no receipt.

### 5.3 Preflight: permission-model conflict and shadowing

"Permission profiles do not compose with the older sandbox settings. Configure
either `default_permissions` and `[permissions]`, or `sandbox_mode` /
`sandbox_workspace_write`, but not both." [S5]

An earlier draft of this section said cross-layer behaviour was undocumented. That
was wrong, and the correction makes the situation worse rather than better. The
behaviour is a documented selection rule: "If `sandbox_mode` appears in **any**
loaded config file, you pass `--sandbox`, or the selected config profile sets
`sandbox_mode`, Codex uses those older sandbox settings instead of
`default_permissions`." [S5]

So `materialize` preflights before writing anything. One traversal answers two
questions. It enumerates the project-tree `.codex/config.toml` files that Codex
itself would load — from the real project root down to the working directory [S2]
— and fails closed on either of:

| Condition | Code |
|---|---|
| any enumerated file assigns `default_permissions` or opens a `[permissions` table | `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` |
| any enumerated file sits deeper than `<project>/.codex/config.toml`, the path `materialize` would write | `TARGET_SETTINGS_SHADOWED` |

Both are exit 4 with no write.

The second check was added after the phase-one self-review. The traversal was
already being performed for the first check, and the closest-file-wins rule [S2]
means a deeper `.codex/config.toml` overrides the file `materialize` is about to
create. Writing an inert file and issuing a receipt for it — leaving the hazard to
be discovered later by `attest` — is a fail-open at the step that is supposed to
be the careful one. Detecting it costs nothing beyond a path comparison already in
hand.

The profile scan is a line-level match for those two forms. It is not a TOML
parse, and it deliberately errs toward blocking: a commented-out or
string-embedded occurrence blocks too, because a silently non-composing security
configuration is not recoverable and a false block is. "Recoverable" means
something specific, since there is no `--force`: the error names the file and line
that matched, and the operator removes or relocates that line. A false positive
therefore costs one edit in a file the operator owns, and it is not a dead end.

Two limits are stated rather than hidden:

- The user layer `~/.codex/config.toml` may define a permission profile.
  GovernSeed must not read it (A4), so that conflict is undetectable and becomes a
  required `precedenceCaveat` entry.
- A managed layer may set `allowed_permission_profiles`, which switches the client
  to the profile model wholesale [S6]. All four managed locations are outside the
  project root, so this is also undetectable and also a caveat.

### 5.3.1 The selection rule makes the preflight a safety gate, not a tidiness check

The selection rule quoted above resolves the conflict in favour of the older
sandbox settings — that is, in favour of exactly the surface this milestone writes.
Defined behaviour is not the same as safe behaviour, and here the defined
behaviour is the dangerous one.

The failure case, stated concretely. A user or managed layer sets
`default_permissions` to a restrictive profile and no layer sets `sandbox_mode`.
GovernSeed then writes `sandbox_mode = "workspace-write"` into the project layer.
By the selection rule, `sandbox_mode` now appears in a loaded config file, so Codex
uses the older sandbox settings *instead of* `default_permissions`. The profile's
restrictions stop applying. GovernSeed's restrictive-looking write has widened the
effective configuration.

This is a widening the restriction-only invariant cannot catch, and strengthening
the invariant does not help. Section 4.1 emits the strictest value each key
admits, which is as strong as a per-key rule can get; the widening happens one
level up, by displacing a different permission model, so no per-key check sees it
however tight that check is. The invariant's scope has to be written down rather
than left implied: it guarantees that no emitted key is looser than any other
value that key could hold, and it does not guarantee that the effective
configuration after materialization is no looser than it was before.

Detection is partial, and the partiality is the point:

| Layer holding the conflicting profile | Detectable | Handling |
|---|---|---|
| project tree, from the project root down to the working directory | yes | preflight, `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT`, exit 4, no write |
| user `~/.codex/config.toml` | no — A4 forbids reading it | required `precedenceCaveat` entry |
| any of the four managed locations | no — all outside the project root | required `precedenceCaveat` entry |

So the response is layered by what is actually knowable:

1. Fail closed on the detectable case. Section 5.3.
2. Carry the undetectable case as a required `precedenceCaveat` entry in every
   receipt and every attestation, so the hazard travels with the artifact instead
   of living only in this document. Baseline entry in section 6.4.
3. State the invariant's scope in the enforcement-boundary narrative, not just
   here, because a reader who sees "restriction-only" will otherwise read it as a
   guarantee about effective configuration.

No error code is defined for the undetectable case. An undetectable condition
cannot be a runtime error, and manufacturing one would require reading the layers
ADR-004 forbids. A caveat that is always present is the honest instrument; a check
that runs only when GovernSeed breaks its own boundary is not.

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
                         materializationStatus, modeCoverage, nativeKeys[],
                         emittedValue
unmaterializedControls[] controlId, capability, materializationStatus,
                         reasonCode, source
ownership                generator "GovernSeed", artifactType
                         "codex-project-config"
status                   enum ["target-materialized", "dry-run"]
```

`unmaterializedControls` must contain every `not-applicable` and `deferred`
control. An `unsupported` control is never silently dropped; that is asserted by
the partial-support fixture.

`modeCoverage` is the `full` / `approval-gate-only` field defined in section
4.1.1. It is required on every entry, and `approval-gate-only` is mandatory for a
`deny` control whose only emitted key is `approval_policy`.

`trustStateObserved` is a single-value enum in this schema on purpose. Widening
it later requires a schema change and therefore a review.

### 5.5 `.codex` is a protected read-only path inside a Codex session

Verified facts. "`.codex` is protected as read-only when it exists as a directory",
alongside `.git` and `.agents`, and "Protection is recursive, so everything under
those paths is read-only" [S3]. The permissions page says the same from the other
side: "Codex's safeguards ensure subfolders such as `.codex/` and `.git/` within a
workspace root are read-only while the rest of the folder is writable" [S5]. No
documented mechanism lifts the protection. Whether creating a `.codex` directory
that does not yet exist is permitted is NOT STATED, which is BLOCKED-4.

The consequence is a scope statement about who runs this command.

`materialize` is a user-run CLI operation. It must not be described, documented,
helped, or tested as something an agent self-bootstraps from inside a standard
Codex `workspace-write` session. Under the default sandbox the target path is
read-only by design, and that design is a Codex safeguard, not an obstacle to
route around. So: no `--force`, no approval-escalation request, no probing for
sandbox membership, no fallback location outside `.codex`, and no retry that lands
the same bytes somewhere else. A refused write stays refused.

The refusal gets its own name rather than surfacing as a generic I/O failure:

```text
MATERIALIZE_TARGET_PATH_PROTECTED    exit 4
```

Exit 4, not exit 5. Exit 5 means the environment failed and the bounded I/O budget
or the filesystem is at fault; this is a governed-boundary refusal with a specific
remedy — run the command from a context where `<project>/.codex` is writable.
Collapsing it into exit 5 would tell an operator to retry, which will fail
identically every time.

Detection is after the fact, by errno on the create or rename of `.codex` or
`.codex/config.toml`: `EACCES`, `EPERM`, or `EROFS` maps to
`MATERIALIZE_TARGET_PATH_PROTECTED`. GovernSeed does not try to predict it. It
cannot know whether it is running inside a sandbox, and inventing a heuristic for
that would be a guess dressed as a check.

Two honesty notes follow from the errno mapping:

- `--dry-run` cannot predict this outcome. Dry run writes nothing, so it never
  touches the protected path; a green dry run is not evidence that the real run
  will be permitted. Section 5.1's determinism guarantee is unaffected — it is
  about bytes, not about permission.
- BLOCKED-4 stays BLOCKED. Because directory creation is NOT STATED, the design
  assumes neither outcome: if creation is permitted the normal path runs, and if it
  is refused the errno mapping fires. Neither branch is presented as documented
  target behaviour.

This constraint also belongs in the artifact, not only in this document, so the
protected-path condition is a required `knownLimitations` entry in section 6.4 and
has a dedicated test in section 11.

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

Semantic value space: `trusted`, `untrusted`, `unknown`. **Both schemas admit only
`unknown` in this milestone** — the receipt and the `attest` output alike — because
BLOCKED-3 found no official surface exposing trust to a project-local reader.
GovernSeed never infers trust from the file's existence, from a successful write,
or from the absence of an error. There is no flag to assert it.

An earlier draft narrowed the receipt schema to `["unknown"]` but left the `attest`
output schema at all three values. That was inconsistent with this design's own
stated principle — closed enums make a claim unrepresentable rather than
blacklisted — and it applied the principle to `level` while leaving `level`'s sole
precondition wide open, in the artifact that actually carries the claim. Widening
either schema later requires a schema change and therefore a review.

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
produces `project-layer-observed`, and one asserts that a hand-constructed output
pairing `project-layer-observed` with any `trustStateObserved` value fails schema
validation — which it must, because the output schema admits only `unknown`
(section 6.2) and the downgrade rule forbids that pairing. The level stays in the
enum as ruled; what makes it unreachable is now structural rather than a code
path.

The plan's §C3 example output shows `level: "project-layer-observed"` together
with `trustStateObserved: "unknown"`, which its own §C4 downgrade rule forbids.
The downgrade rule wins and the example is illustrative only; section 10.3 records
it.

### 6.4 Output contract

Schema `schemas/attest-output.schema.json`, closed, required fields:

```text
schemaVersion         integer, const 1
level                 enum ["project-layer-observed", "materialized-unverified"]
trustStateObserved    enum ["unknown"]
target                enum ["codex"]
policyId, policyHash, materializeId
declared              integer, count of controls in the compiled policy manifest
materialized          integer, count of controls the receipt lists in
                      materializedControls[]; declared - materialized equals the
                      length of unmaterializedControls[]
projectLayerObserved  integer, count of materialized controls whose emitted keys
                      are still byte-identical in the current target file. It is
                      0 when the file is absent or has drifted, and it equals
                      materialized when the file matches. It counts bytes
                      compared, never trust, so it does not license the
                      project-layer-observed level on its own.
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
Because sandbox_mode in any loaded config file makes Codex use the sandbox settings
  instead of default_permissions, the sandbox_mode written here can displace a
  stricter permission profile set in the user layer or a managed layer. Neither
  layer is readable from the project, so this file may widen the effective
  configuration even though every value it contains is the strictest value that key
  admits. [S5]
```

Baseline `knownLimitations` content:

| controlId | note | source |
|---|---|---|
| `POL-SHELL-EXECUTION` | Command rules are experimental and govern commands outside the sandbox; not written. | S4 |
| `POL-FILESYSTEM-PROJECT-READ` | A read-scope surface exists as `[permissions.<name>.filesystem]`, but it is Beta and mutually exclusive with the sandbox settings written here, so it is out of scope this milestone rather than unavailable. | S5, S6 |
| `POL-CREDENTIALS` | Project config cannot override provider, auth, or telemetry keys. | S2 |
| every `deny` control on `delete`, `publish`, or `shell.execution` | Materialized as `approval_policy = "untrusted"`, which prompts rather than denies; a human approval performs the action. Carried per control as `modeCoverage = "approval-gate-only"`. | S1, S3, section 4.1.1 |
| `POL-EXTERNAL-CONTENT` | Web-search keys exist but the mapping from untrusted-content handling to them is unreviewed. | S1 |
| all `materializable` controls | For Codex 0.138.0 and later the documentation prefers permission profiles and recommends the sandbox-mode surface only for legacy deployments; this milestone writes the legacy surface by frozen scope, not by platform preference. | S5, S6 |
| all `materializable` controls | A written project-layer value is reported as ignored on some Codex surfaces. | I30001, I8714 |
| all `materializable` controls | `<project>/.codex` is recursively read-only under the default `workspace-write` sandbox, so `materialize` is a user-run operation and cannot be assumed to work from inside a standard Codex session. | S3, S5 |
| all `materializable` controls | Writing `sandbox_mode` makes Codex use the sandbox settings instead of `default_permissions`, so this file can displace a stricter permission profile in a layer GovernSeed must not read. | S5 |

The `materializable` rows are why `materializationStatus` never implies
effectiveness. They come from the target's own documentation and its issue tracker,
not from GovernSeed's judgement: two say the written value may not take effect, one
says the write itself may be refused, and one says the write can subtract a
restriction that came from elsewhere.

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

The last two rows are detectable from the project tree alone, and both are now
checked at materialize time as well (section 5.3). Here they catch the same
conditions arising *after* a successful materialize: a nearer `.codex/config.toml`
added later under S2's closest-file-wins rule, or a permission profile added
later.

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
| `MATERIALIZE_TARGET_PATH_PROTECTED` | materialize | 4 |
| `MATERIALIZE_OUTSIDE_PROJECT` | materialize | 4 |
| `MATERIALIZE_PARTIAL_OUTPUT` | materialize, attest | 4 |
| `TARGET_SETTINGS_DRIFT` | attest | 4 |
| `TARGET_SETTINGS_SHADOWED` | materialize (preflight), attest (drift) | 4 |

`CLI_TARGET_UNSUPPORTED` and `CLI_USAGE_ERROR` reuse the codes the existing
compile usage test already pins, so `--target claude` behaves consistently across
all three commands.

`MATERIALIZE_PATH_BLOCKED` and `MATERIALIZE_TARGET_PATH_PROTECTED` are different
refusals and stay separate. The first is GovernSeed refusing its own write —
symlink, hardlink, traversal, or absolute path — decided before anything is
staged. The second is the target's sandbox refusing the write, discovered by errno
while committing it (section 5.5). One says the request was malformed; the other
says the request was well-formed and the environment declined it.

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
| identifiers introduced by this milestone, listed in full below | machine names, not governance claims | allowlisted by exact string |

The last row was added after the phase-one self-review, which found that fixture
11 as first written could not pass this design's own implementation: every new
identifier contains `materializ` and none of them is `adapter-materialized` or
`target-materialized`, so the check would have gone red the moment phase two
landed. The distinction the check actually needs is **prose versus identifier** —
ambiguity in a sentence is the harm; a field name is not a claim.

So the check scans prose and skips exact matches of this closed list:

```text
materialize                        command name
materializationStatus              receipt and attest field
materializedControls               receipt field
unmaterializedControls             receipt field
materializeId                      identity field
materializedAt                     receipt timestamp field
materialized                       attest count field
materialized-unverified            level value
target-materialized                receipt status value
MATERIALIZE_RECEIPT_MISSING        error codes, all of which begin MATERIALIZE_
MATERIALIZE_RECEIPT_INVALID
MATERIALIZE_WOULD_WIDEN
MATERIALIZE_PATH_BLOCKED
MATERIALIZE_TARGET_PATH_PROTECTED
MATERIALIZE_OUTSIDE_PROJECT
MATERIALIZE_PARTIAL_OUTPUT
materialize-receipt.schema.json    schema filename
MAT-                               artifact identity prefix
```

The list is closed, not a pattern. A future identifier must be added to it
deliberately, which is the point: adding a name is cheap, and being forced to
notice you are adding one is the check's whole value.

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

5. **BLOCKED-2 is closed, and its residue is renamed.** The managed requirement
   locations and their precedence are documented [S6], so the caveat names real
   paths instead of asserting that the layer is undocumented. The residue is not a
   documentation gap at all, so calling it BLOCKED would be wrong: managed and
   other non-project precedence is external and non-observable from project-local
   evidence. That is a permanent property of where those files live, not something
   further research can close. Sections 2.2, 2.4.
6. **BLOCKED-1 is withdrawn as a reason, and the deferral is restated on scope.**
   A read-scope surface does exist (`[permissions.<name>.filesystem]`, plus admin
   `deny_read`), so the earlier wording that Codex has no read-scope surface was
   wrong and is deleted. The follow-up reason "project-layer availability is
   undocumented" is withdrawn too, because the same inference by exclusion is what
   licenses writing four other keys; using it as a blocker here and a licence there
   was inconsistent. `filesystem.project-read` is `deferred` on scope: Beta status,
   mutual exclusivity with the surface this milestone writes, and no reviewed
   mapping. Sections 2.3, 2.3.1, 2.4.
7. **Non-composition is a documented selection rule, not undefined behaviour.** An
   earlier draft called cross-layer behaviour undocumented. It is documented: any
   loaded `sandbox_mode` makes Codex use the sandbox settings instead of
   `default_permissions` [S5]. The correction is worse news, because it means the
   `sandbox_mode` written here can displace a stricter permission profile in the
   user or a managed layer and thereby widen the effective configuration, while
   every emitted value still passes the per-key restriction-only check. Handled as
   a fail-closed preflight for the detectable case, an attest drift reason, a
   required `precedenceCaveat` and `knownLimitations` pair for the undetectable
   case, and an explicit statement of what restriction-only does not guarantee.
   Sections 2.3, 5.3, 5.3.1, 6.4, 6.5.
8. **`.codex` is a protected read-only path, so materialize is user-run.**
   `.codex` is recursively read-only under the default `workspace-write` sandbox
   [S3, S5]. Materialize is therefore never described or tested as
   agent-self-bootstrappable, the sandbox refusal gets its own exit-4 code
   `MATERIALIZE_TARGET_PATH_PROTECTED` rather than a generic exit 5, and the
   constraint is carried in `knownLimitations` and a dedicated test instead of
   prose. BLOCKED-4 is added and stays open: whether creating a missing `.codex`
   directory is permitted is NOT STATED, so neither outcome is assumed.
   Sections 2.1, 2.4, 5.5, 6.4, 7, 11.

### 10.2.1 Fixed by the phase-one self-review on 2026-07-30

Nine defects were found by reviewing this document against the repository rather
than against the reviews. Three would have blocked implementation outright.

| # | Defect | Fix |
|---|---|---|
| 9 | `materializeId` was embedded in the emitted file while its digest input was left undefined; read against the `compileIdFor` precedent it was circular | identity defined as input-only, with the deviation and its reason recorded. Section 5.1 |
| 10 | fixture 11 could not pass this design's own implementation — every new identifier contains `materializ` and none was allowlisted | prose/identifier distinction plus a closed identifier list. Section 9.2 |
| 11 | the restriction-only invariant was defined against Codex defaults that this document never records or cites | restated as "the strictest value the key admits", which needs no default and holds regardless of them. Section 4.1 |
| 12 | `trustStateObserved` was narrowed to `["unknown"]` in the receipt schema but left at three values in the `attest` output — the artifact that carries the claim | both schemas narrowed; `project-layer-observed` is now structurally unreachable rather than code-guarded. Sections 6.2, 6.3 |
| 13 | a `deny` control materialized as `approval_policy = "untrusted"` was reported as `materializable` with the "approval gate only" qualifier living only in a prose table cell | required `modeCoverage` field, a `knownLimitations` row, and the `deny-is-not-denied` test. Sections 4.1.1, 5.4, 6.4 |
| 14 | shadowing was detectable by a traversal materialize already performs, but was only reported by `attest`, so materialize could write an inert file and issue a receipt for it | both preflight checks share one traversal; `TARGET_SETTINGS_SHADOWED` is now a materialize failure too. Sections 5.3, 6.5, 7 |
| 15 | ownership recognition trusts any receipt in `.agent-governance/receipts/`, which are unsigned | stated as the design's trust boundary rather than left implied. Section 5.2 |
| 16 | `materialized` and `projectLayerObserved` counts were undefined while `declared` was defined | all three defined, including why `projectLayerObserved` counts bytes and never licenses the level. Section 6.4 |
| 17 | `[sandbox_workspace_write]` appeared under `sandbox_mode = "read-only"` in the example, where it has no documented effect, and no emission rule was stated | the table is emitted only under `workspace-write`; both forms byte-pinned. Section 5.1 |

### 10.3 Still open for the phase-one review

9. ~~**The plan's fixture 7 conflicts with the shipped package surface.**~~
   **Ruled on 2026-07-30: the plan wording is corrected, the whitelist stands.**
   Fixture 7 now asserts that the tarball ships nothing outside the resolved
   `files` whitelist, rather than naming directories. `experimental/`,
   `examples/` and `.github/` are not in the whitelist, so they stay covered;
   `tests/policy-compiler/fixtures/`, `fixture-contracts.test.mjs` and the five
   `docs/` paths ship by design, several of them pinned by
   `tests/brand/brand-compatibility.test.mjs`. Written as
   `tests/governance/package-surface.test.mjs`.

   Red evidence: adding `examples/template-adoption/base-minimal/` to the
   whitelist turned two of its three assertions red, and one of them caught a
   path the whitelist never named — npm also publishes
   `examples/template-adoption/README.md` for an entry nested below it. That is
   exactly the silent widening this fixture exists to catch.
10. **The plan's §C3 example contradicts its own §C4 downgrade rule.** The example
   shows `level: "project-layer-observed"` with `trustStateObserved: "unknown"`.
   This design follows §C4, so the downgrade rule wins and the example is
   illustrative only. Section 6.3.

### 10.4 Corrected during implementation on 2026-07-30

11. **The fixed identifier list in section 9.2 was replaced by a prose/identifier
   split.** The phase-one review already found that a closed list cannot work
   because every identifier the milestone introduces contains the substring; the
   list it produced still failed the moment the implementation existed, because
   the attest output needs a field literally named `materialized`. The check now
   scans Markdown whole and scans source and schema files only inside quoted
   strings containing a space — user-visible text — after masking the three
   qualified terms. It still caught six real occurrences, one of them in the
   attestation's own `knownLimitations` text.
12. **A ceiling is bounded at three layers, and an unrequested capability
   compiles to `deny` regardless of its ceiling.** Editing only the risk
   profile is rejected as `POLICY_PRIVILEGE_EXPANSION`
   (`policy-compiler-core.mjs:229-234`), and `requestedGrant` falls back to
   `deny` when no role requested the capability (`policy-compiler-core.mjs:374-380`).
   The tests that need a different compiled policy therefore change the risk
   profile, the assignment ceiling and every role grant together, and add the
   capability to the task and role requests when a looser mode is required.
   Two helpers in `tests/policy-compiler/helpers.mjs` carry this.
13. **`sha256Before` is run state, not identity.** The first run records `null`
   and every later run records the file's own hash, so receipt equivalence
   compares `path` and `sha256After` only. The emitted report carries the
   current run's `sha256Before`; the persisted receipt keeps the transition it
   recorded. This mirrors how the compile receipt excludes `compiledAt` and the
   file-state lists.

## 11. Test Plan

Failing tests first, red evidence captured before any implementation, per the
plan's ordering. Fixtures 1-5 and 8-11 below map to the plan's numbered list.

The plan's fixtures 6 and 7 belong to scope A. Fixture 6 (`core-boundary`) is
merged as `tests/governance/core-release-boundary.test.mjs`. **Fixture 7
(`package-surface`) is not merged**: no `npm pack` assertion exists anywhere in
`tests/` or CI. An earlier draft of this section claimed both were merged. Section
10.3 records the plan conflict that has to be settled before fixture 7 can be
written at all.

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
| model-override-caveat | `precedenceCaveat` contains the entry stating that the written `sandbox_mode` can displace a stricter `default_permissions` profile in an unreadable layer, and `knownLimitations` carries its `materializable` counterpart; removing either fails the test |
| target-path-protected | with `<project>/.codex` made unwritable (`chmod 0o500`), materialize exits 4 with `MATERIALIZE_TARGET_PATH_PROTECTED`, writes no config bytes, and writes no receipt; POSIX-only, skipped on Windows and when running as root, and the skip is reported rather than silent |
| protected-path-caveat | `knownLimitations` carries the `.codex`-recursively-read-only entry, and no help text, README line, or output string describes materialize as agent-self-bootstrappable |
| deny-is-not-denied | a `deny` control on `delete`, `publish`, or `shell.execution` is recorded with `modeCoverage = "approval-gate-only"`; a receipt that omits the field or claims `full` fails schema validation; the matching `knownLimitations` row is present |
| identity-not-circular | `materializeId` is reproducible from the compiled policy alone, before the target file exists; recomputing it from the emitted bytes is not part of any code path; two runs over an unchanged policy yield one identity |
| shadowed-blocks-materialize | a deeper `.codex/config.toml` blocks materialize with `TARGET_SETTINGS_SHADOWED`, exit 4, no write and no receipt — not merely reported later by attest |
| strictest-value | every value the emitter can produce is the strictest its key admits; a mutation test that loosens any single emitted value fails |
| trust-enum-narrowed | both schemas reject `trusted` and `untrusted` for `trustStateObserved`, and an attest output pairing `project-layer-observed` with any admissible value fails validation |
| workspace-write-table-only | `[sandbox_workspace_write]` is absent under `sandbox_mode = "read-only"` and present under `workspace-write`; both forms are byte-pinned |

## 12. Implementation Registration

Phase two must also update, or `npm run validate` and `npm run check` will fail:

```text
package.json          check script entries for the new lib modules; files
                      whitelist gains docs/enforcement-boundary.md per 10.1
scripts/agent-governance.mjs   command dispatch, usage text, option parsing
scripts/lib/           new codex-target-materializer and attest modules
schemas/               materialize-receipt and attest-output schemas, both with
                      trustStateObserved narrowed to ["unknown"] and the receipt
                      carrying the required modeCoverage field
scripts/validate-starter.mjs   required-file lists for the new schemas and docs
docs/policy-compiler.md        non-claims section and the superseded four levels
docs/enforcement-boundary.md   what restriction-only does not guarantee (5.3.1),
                      the .codex protected-path constraint (5.5), and the
                      schema-reserved label on project-layer-observed
README.md              FAQ, evidence surfaces table, claim boundaries; materialize
                      described as a user-run command
CHANGELOG.md           the rule-lifecycle record required by AGENTS.md
```

Per the frozen decision, the README rewrite lands in the same commit as the
`materialize` implementation and not before, because the current wording stays
true until the command exists.

Landed on 2026-07-30 in `6f6e5ed`, one commit, all of the above. `npm run ci`
exits 0; the strict doctors for both examples exit 0; `npm pack --dry-run` ships
113 entries with the new schemas, modules and boundary document included and
nothing from `tests/` outside the fixture surface, `docs/` outside the whitelist,
`experimental/`, or `examples/`.

## 13. Non-Goals

Unchanged from the plan: no `runtime-evidenced` level, no Agent or model
execution, no user-global or managed write, no claude or antigravity target, no
new root document, no `.codex/rules/`, no `AGENTS.md` modification, no change to
the five matrix classifications, and no effective-configuration or
trusted-project claim that has not actually been observed.
