# Enforcement Boundary

What `materialize` and `attest` establish, and what they deliberately do not.

Canonical rules live in [`ADR-005`](adr/005-target-materialization-and-attestation-boundary.md).
This document is the published narrative for users of the two commands.

## The two words that used to be one

- `adapter-materialized` — the Codex Adapter JSON exists under
  `.agent-governance/adapters/codex/` and its hash matches the compile receipt.
  `compile` produces this.
- `target-materialized` — the strictest value each written key admits has been
  written into `.codex/config.toml` and recorded in a materialize receipt.
  `materialize` produces this.

Reaching the first says nothing about the second.

## What materialize writes

One file: the project-local `.codex/config.toml`, plus its own receipt under
`.agent-governance/receipts/MAT-*.json`. Nothing else, ever:

- never `~/.codex/config.toml` or any other user-global path;
- never a managed requirement layer (`/etc/codex/requirements.toml`,
  `%ProgramData%\OpenAI\Codex\requirements.toml`, a cloud config bundle, a
  legacy `managed_config.toml`, or macOS MDM preferences);
- never any path outside the project root;
- never `.codex/rules`, and never an edit to `AGENTS.md`.

If `.codex/config.toml` exists and GovernSeed does not own it, materialize
refuses with `TARGET_SETTINGS_OWNER_CONFLICT` and leaves the file byte-identical.
Ownership is recognised from the receipts directory, which holds
content-addressed but unsigned files: an actor who can write there can cause an
overwrite. That is the stated trust boundary, not a defended one.

## Restriction-only

Every value materialize emits is the strictest value that key admits. A policy
that would require a looser value is refused (`MATERIALIZE_WOULD_WIDEN`) rather
than written. The invariant is stated against the key, not against a Codex
default, so it holds without depending on an undocumented baseline.

The restriction-only invariant is a property of each value in isolation. It is
not a claim about the composed result — see the displacement hazard below.

## Two fail-closed preflight conditions

Both are checked before any write, and both are re-checked by `attest`:

1. **`TARGET_SETTINGS_PROFILE_MODEL_CONFLICT`** — permission profiles
   (`default_permissions`, `[permissions.<name>]`) and the sandbox settings this
   milestone writes are two models that do not compose. If either appears in any
   `.codex/config.toml` in the project tree, materialize refuses.
2. **`TARGET_SETTINGS_SHADOWED`** — Codex loads the `.codex/config.toml` closest
   to the working directory. A nearer file would make the written one inert, so
   materialize refuses instead of producing a file that has no effect.

## The displacement hazard

Codex documents that if `sandbox_mode` appears in **any** loaded config file, it
uses those sandbox settings instead of `default_permissions`. Writing
`sandbox_mode` can therefore displace a stricter permission profile set in the
user layer or a managed layer — layers GovernSeed must not read.

So a file in which every individual value is the strictest that key admits can
still widen the composed configuration. This is reported in every attestation's
`precedenceCaveat`; it is not a defect that a future patch removes.

## Why the legacy surface

For Codex 0.138.0 and later the documentation prefers permission profiles and
recommends the sandbox-mode surface for legacy deployments. This milestone
writes the legacy surface by frozen scope, not because it is the platform's
preferred model.

## `.codex` is a protected path

Under the default `workspace-write` sandbox the project `.codex` directory is
recursively read-only, the same protection `.git` gets. `materialize` is
therefore a user-run operation and must not be assumed to work from inside a
standard Codex session. When the path is protected, the refusal is named
(`MATERIALIZE_TARGET_PATH_PROTECTED`) rather than surfacing as a generic I/O
error.

## What attest reports

`attest` is read-only. It compares three things: the compiled policy, the
materialize receipt, and the bytes currently at the target path. It reports
drift — the file edited outside GovernSeed, removed, or bound to a policy that
has since been recompiled — and it never rewrites anything.

Its level is capped:

- `materialized-unverified` — the reachable level. The bytes match the receipt
  and the receipt matches the policy.
- `project-layer-observed` — **schema-reserved**. It stays in the enum so a
  future trust-observation design needs no breaking change, and it is
  unreachable while `trustStateObserved` admits only `unknown`.

`trustStateObserved` is always `unknown`. The project layer loads only for a
trusted project, and trust is set through `projects.<path>.trust_level` in a
layer GovernSeed must not read. No flag and no environment variable raises the
level; the downgrade is applied after every comparison.

Every attestation carries a hard-coded claim string:
`PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.

## What is never established

- That Codex read the file.
- That the project is trusted.
- That a nearer file, the user layer, a managed layer, a profile, or a
  `--config` flag did not override it.
- That the effective configuration matches the policy.
- That an Agent complied, or that a human approved anything.

## Controls with no project-layer surface this milestone

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
