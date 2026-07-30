# Enforcement Boundary

What `materialize` and `attest` establish, and what they deliberately do not.

Canonical rules live in [`ADR-005`](adr/005-target-materialization-and-attestation-boundary.md).
This document is the published narrative for users of the two commands.

## The two words that used to be one

- `adapter-materialized` — the adapter JSON for a target exists under
  `.agent-governance/adapters/<target>/` and its hash matches the compile
  receipt. `compile` produces this.
- `target-materialized` — the strictest value each written key admits has been
  written into that target's project-local settings file and recorded in a
  materialize receipt. `materialize` produces this.

Reaching the first says nothing about the second.

## What materialize writes

One project-local settings file per target, plus its own receipt under
`.agent-governance/receipts/MAT-*.json`:

| Target | File | Ownership |
|---|---|---|
| `codex` | `.codex/config.toml` | whole file |
| `claude` | `.claude/settings.json` | per entry |

Nothing else, ever:

- never `~/.codex/config.toml`, `~/.claude/settings.json`, or any other
  user-global path;
- never a managed layer — for Codex `/etc/codex/requirements.toml`,
  `%ProgramData%\OpenAI\Codex\requirements.toml`, a cloud config bundle, a
  legacy `managed_config.toml`, or macOS MDM preferences; for Claude Code
  `/Library/Application Support/ClaudeCode/`, `/etc/claude-code/`,
  `C:\Program Files\ClaudeCode\`, or a server-managed equivalent;
- never `.claude/settings.local.json`, which outranks the project layer;
- never any path outside the project root;
- never `.codex/rules`, and never an edit to `AGENTS.md` or `CLAUDE.md`.

Ownership is recognised from the receipts directory, which holds
content-addressed but unsigned files: an actor who can write there can cause an
overwrite. That is the stated trust boundary, not a defended one.

## Two ownership models

GovernSeed generates `.codex/config.toml` whole, so it owns the file. If one
exists and GovernSeed does not own it, materialize refuses with
`TARGET_SETTINGS_OWNER_CONFLICT` and leaves the file byte-identical.

`.claude/settings.json` is a file teams also hand-edit. Claude Code tolerates
unknown keys, so an in-file ownership marker would load — but a project that
references the official settings schema would then show its users an editor
validation warning on a key GovernSeed invented. So ownership there is per
entry and lives only in the receipt, which records exactly which permission
rules and which scalar keys GovernSeed wrote. Materialize merges into whatever
it finds:

- entries the receipt does not claim are never removed or reordered;
- unknown keys are preserved;
- re-running produces a byte-identical file and no second receipt;
- a governed scalar that already holds a different value fails closed with
  `TARGET_SETTINGS_SCALAR_CONFLICT`, naming both values;
- a file that does not parse is refused with `TARGET_SETTINGS_UNPARSEABLE`
  rather than replaced.

The consequence is published, not hidden: this file is **not** a statement of
the complete restriction set for the project, only of what GovernSeed wrote.

## Restriction-only

Every value materialize emits is the strictest value that key admits. A policy
that would require a looser value is refused (`MATERIALIZE_WOULD_WIDEN`) rather
than written. The invariant is stated against the key, not against a runtime
default, so it holds without depending on an undocumented baseline.

For Claude Code that confines output to `permissions.deny`, `permissions.ask`,
and the two mode locks. `permissions.allow` and
`permissions.additionalDirectories` are never written: they grant capability,
and per the capability matrix they also depend on the workspace trust dialog.

The restriction-only invariant is a property of each value in isolation. It is
not a claim about the composed result — see the displacement hazards below.

## Fail-closed preflight conditions (Codex)

Both are checked before any write, and both are re-checked by `attest`:

1. **`TARGET_SETTINGS_PROFILE_MODEL_CONFLICT`** — permission profiles
   (`default_permissions`, `[permissions.<name>]`) and the sandbox settings
   GovernSeed writes are two models that do not compose. If either appears in
   any `.codex/config.toml` in the project tree, materialize refuses.
2. **`TARGET_SETTINGS_SHADOWED`** — Codex loads the `.codex/config.toml` closest
   to the working directory. A nearer file would make the written one inert, so
   materialize refuses instead of producing a file that has no effect.

The Claude target has no equivalent preflight. Neither condition transfers:
Claude Code merges settings across fixed scopes rather than loading the nearest
file, so no nearer file replaces the project layer, and there is no competing
profile model to collide with.

## The displacement hazards

**Codex.** Codex documents that if `sandbox_mode` appears in **any** loaded
config file, it uses those sandbox settings instead of `default_permissions`.
Writing `sandbox_mode` can therefore displace a stricter permission profile set
in the user layer or a managed layer — layers GovernSeed must not read.

**Claude Code.** Permission rules merge across scopes and `deny` is evaluated
first with specificity ignored, so a `deny` or `ask` entry written into the
project layer cannot be removed or weakened by a higher-precedence file. The
mode locks are not rules and can be displaced: `.claude/settings.local.json` is
gitignored and outranks the project layer, command line arguments outrank every
settings file, and managed settings outrank everything and live outside the
project root where GovernSeed cannot read them.

A second Claude Code hazard is fail-open by omission rather than by
precedence: a project or local settings file that fails validation is rejected
**as a whole**, which would drop every entry in that layer, including entries
the team wrote itself. That is why an unparseable existing file is refused
instead of replaced.

So a file in which every individual value is the strictest that key admits can
still widen the composed configuration. This is reported in every attestation's
`precedenceCaveat`; it is not a defect that a future patch removes.

## Why the legacy Codex surface

For Codex 0.138.0 and later the documentation prefers permission profiles and
recommends the sandbox-mode surface for legacy deployments. GovernSeed writes
the legacy surface by frozen scope, not because it is the platform's preferred
model.

## `.codex` is a protected path

Under the default `workspace-write` sandbox the project `.codex` directory is
recursively read-only, the same protection `.git` gets. `materialize` is
therefore a user-run operation and must not be assumed to work from inside a
standard Codex session. When the path is protected, the refusal is named
(`MATERIALIZE_TARGET_PATH_PROTECTED`) rather than surfacing as a generic I/O
error. The same named refusal covers `.claude`, though no equivalent
platform-imposed protection is documented for it.

## What attest reports

`attest` is read-only. It compares three things: the compiled policy, the
materialize receipt, and the bytes currently at the target path. It reports
drift — the file edited outside GovernSeed, removed, or bound to a policy that
has since been recompiled — and it never rewrites anything.

For the Claude target, drift is the project layer no longer matching what the
receipt requires. Two conditions are reported without being drift, because they
do not contradict the receipt:

- `TARGET_SETTINGS_ADDITIONAL_RESTRICTION` — a `deny` or `ask` entry GovernSeed
  does not own. Rules merge, so an extra one restricts further.
- `TARGET_SETTINGS_LOCAL_SCOPE_PRESENT` — a `.claude/settings.local.json`
  exists. Its mere presence is reported; it becomes drift only when it sets a
  governed scalar to a different value, which is the only case precedence can
  actually displace.

Its level is capped, for every target:

- `materialized-unverified` — the reachable level. The bytes match the receipt
  and the receipt matches the policy.
- `project-layer-observed` — **schema-reserved**. It stays in the enum so a
  future trust-observation design needs no breaking change, and it is
  unreachable while `trustStateObserved` admits only `unknown`.

`trustStateObserved` is always `unknown`. For Codex the project layer loads only
for a trusted project, and trust is set through `projects.<path>.trust_level` in
a layer GovernSeed must not read. For Claude Code the workspace trust dialog is
interactive and leaves no documented project-local record. No flag and no
environment variable raises the level; the downgrade is applied after every
comparison.

Every attestation carries a hard-coded claim string:
`PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.

## What is never established

- That the runtime read the file.
- That the project is trusted.
- That a nearer file, a local file, the user layer, a managed layer, a profile,
  or a command line argument did not override it.
- That the effective configuration matches the policy.
- That an Agent complied, or that a human approved anything.

## Controls that are not target-materialized

Some have no native project-layer surface at all; others have one that is
deferred because the available mapping would be a partial expression of the
control. Every attestation reports which, with a reason code.

Codex:

| Control | Why it is not target-materialized |
|---|---|
| `POL-SHELL-EXECUTION` | Command rules are experimental and govern commands outside the sandbox; no rules file is written. |
| `POL-FILESYSTEM-PROJECT-READ` | A read-scope surface exists as `[permissions.<name>.filesystem]`, but it is Beta and mutually exclusive with the sandbox settings written here. Out of scope, not unavailable. |
| `POL-CREDENTIALS` | Project config cannot override provider, auth, or telemetry keys. |
| `POL-EXTERNAL-CONTENT` | Web-search keys exist but the mapping from untrusted-content handling to them is unreviewed. |
| `POL-GENERATED-ARTIFACTS`, `POL-RETENTION`, `POL-VERIFICATION` | No native project-layer surface. |

A `deny` on delete or publish is written as `approval_policy = "untrusted"`,
which prompts rather than denies. Those controls are reported with
`modeCoverage: "approval-gate-only"` so an approval gate never reads as full
coverage.

Claude Code:

| Control | Why it is not target-materialized |
|---|---|
| `POL-NETWORK` | No verified project-layer key controls network egress. The control is deferred rather than approximated with a `Bash(curl *)`-style deny, which the capability matrix refuses as non-equivalent. |
| `POL-FILESYSTEM-ROOT-WRITE` | `additionalDirectories` only grants access. No documented key narrows the working directory below its default. |
| `POL-EXTERNAL-CONTENT` | `WebFetch` and `WebSearch` are deniable, but denying them leaves shell-mediated retrieval, so the mapping is a partial expression rather than the control. |
| `POL-DELETE`, `POL-PUBLISH` | No documented tool name isolates deletion or publishing, so a bare-name deny would remove unrelated capability. |
| `POL-CREDENTIALS`, `POL-GENERATED-ARTIFACTS`, `POL-RETENTION`, `POL-VERIFICATION` | No native project-layer surface. |

Two Claude controls are written but do not close the capability they name:
removing the read tools or the write tools does not close reads and writes
performed through the shell. The emitted key fully expresses the mode for the
tools it names, and nothing more. Both are stated in every attestation's
`knownLimitations`.

Every Claude Code claim above is sourced to
[`the capability matrix`](research/2026-07-31-claude-code-policy-capability-matrix.md),
which carries the official documentation links and its own `BLOCKED` list.
