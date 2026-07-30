# Milestone 4 — Runtime Materialization Parity

**Date:** 2026-07-31 (Asia/Taipei)

**Baseline:** `main@eee0dc5` (Milestone 3, PR #14)

**Status:** Plan for review. Nothing in this document is implemented.

## Definition

Materialization — turning already-compiled governance rules into settings each
runtime can load directly.

Milestone 3 delivered that for one target. This milestone makes the capability
symmetric across runtimes behind a shared contract, with Claude Code as the
reference implementation and Antigravity following it.

## Frozen Inputs

These documents govern this milestone and must not be modified by it. If this
plan conflicts with one of them, the document wins; stop and report rather than
adjudicate.

- `docs/adr/004-risk-to-policy-compiler.md`
- `docs/adr/005-target-materialization-and-attestation-boundary.md`
- `docs/research/2026-07-29-codex-policy-capability-matrix.md` — the five
  classification definitions. No sixth classification. No control upgraded to
  `enforceable`.
- `docs/research/2026-07-31-claude-code-policy-capability-matrix.md` — the
  Claude Code source evidence, including its `BLOCKED` rows.
- `docs/enforcement-boundary.md` — the published claim boundary.

## Confirmed Decisions

1. **Shared contract first, then the reference implementation.** The target
   abstraction lands before the Claude materializer, so the Claude target is
   the first *consumer* of the contract rather than its definition.
2. **Claude Code is the reference implementation. Antigravity follows.**
   Antigravity is blocked until its own capability matrix exists with official
   sources; see BLOCKED item 2 in the Claude matrix.
3. **Acceptance covers `compile → materialize → attest` end to end for the
   Claude target.** A materializer without a passing attest cycle is not
   acceptance.
4. **Restriction-only remains absolute.** For Claude Code that confines output
   to `permissions.deny`, `permissions.ask`, the two mode locks, and a
   `defaultMode` restricted to `plan` or `dontAsk`. `permissions.allow` and
   `permissions.additionalDirectories` are never written — they grant
   capability, and per the matrix they also depend on the workspace trust
   dialog.
5. **The Codex target's observable behavior does not change.** Its emitted
   bytes, receipt identity, and attestation output stay identical. Any diff in
   Codex output means the generalization leaked.

## Current Coupling To Remove

`codex` is hardcoded at these sites, all verified against `main@eee0dc5`:

| File | Site |
|---|---|
| `scripts/lib/policy-compiler-core.mjs` | `targetSupport: { codex: support }` (~line 498); `options?.target !== 'codex'` (~618); `control.targetSupport.codex === 'unsupported'` (~678); `target: 'codex'` (~682); `targetSupport.codex === 'requires-human-approval'` (~692); `targets: [{ target: 'codex', … }]` (~743) |
| `schemas/codex-policy-adapter.schema.json` | `"target": { "const": "codex" }` |
| `scripts/agent-governance.mjs` | `command.target !== 'codex'` (~1033, ~1142); usage strings (~120-122) |

## Scope A — Shared Target Contract

Generalize the single-target assumption without changing Codex behavior.

- `targetSupport` becomes a per-target map keyed by target name; the Codex key
  keeps its current values byte-for-byte.
- The adapter schema's `target` becomes an enum over registered targets. The
  Codex adapter output must remain schema-valid and byte-identical.
- A target registry declares, per target: the project-local file path it owns,
  its capability matrix document, its materializer module, and its attestation
  caveats.
- CLI `--target` validates against the registry instead of a literal.

**Acceptance:** every existing test passes unmodified, and a new test asserts
that compiling the base fixture for `codex` produces the same `policyId`,
`policyHash`, and adapter bytes as `main@eee0dc5`.

## Scope B — Claude Target Materializer

- Owns `.claude/settings.json` and nothing else. Writing to
  `~/.claude/settings.json`, `.claude/settings.local.json`, or any managed
  settings path is a fail-closed error with a dedicated negative test, mirroring
  the Codex boundary test.
- Emits only the restricting keys listed in decision 4.
- Merge behavior with a pre-existing `.claude/settings.json` must be decided
  before implementation: the Codex target owns its whole file, but
  `.claude/settings.json` is a file teams already keep in version control. Two
  candidate rules — own the whole file and refuse when it exists unowned, or
  own only a delimited GovernSeed block. **This is the one open design question
  in this milestone and it needs a decision before Scope B starts.**
- Reuses without change: no-overwrite ownership, receipt-last write order,
  content-addressed identity, canonical JSON hashing, deterministic double-run
  zero diff, dry-run zero writes.
- `MAT-` identity stays input-only: `sha256Canonical({policyId, policyHash,
  target, plannedKeys})`.

**Acceptance:** materialize twice produces zero diff and no second receipt;
dry-run writes nothing; the negative tests for each protected path fail closed;
the emitted file contains no `allow` and no `additionalDirectories`.

## Scope C — Claude Attestation

- Level ceiling stays `project-layer-observed`, enforced by schema.
- `trustStateObserved` remains `unknown` and downgrades to
  `materialized-unverified`. Claude Code's workspace trust dialog is
  interactive and leaves no documented project-local record, so trust is not
  observable here either.
- `precedenceCaveat` is target-specific and for Claude must state the
  documented order: managed, then command line arguments, then
  `.claude/settings.local.json`, then `.claude/settings.json`, then
  `~/.claude/settings.json`.
- New drift and shadowing findings:
  - `.claude/settings.local.json` exists → report shadowing. It is gitignored
    and outranks the governed file.
  - Managed settings may exist and are not readable from the project layer →
    permanent caveat, never resolved to "absent".
- `claim` stays hardcoded `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.
- `knownLimitations` and `precedenceCaveat` stay required and non-empty.

**Acceptance:** attest reports the three-way comparison for the Claude target;
a planted `.claude/settings.local.json` produces the shadowing finding; the
schema rejects any level above `project-layer-observed`.

## Scope D — Antigravity

Blocked. Entry condition: an Antigravity capability matrix with official
sources and its own `BLOCKED` list, in the same shape as the Claude matrix.
Until then this scope produces no code and no claim.

## Testing And Verification

- Red first: every contract test is written and its failure recorded before the
  implementation that satisfies it.
- The Codex byte-identity test from Scope A is the regression guard for the
  whole milestone.
- Full `npm run ci` on macOS, Linux, and Windows via the existing GitHub
  Actions matrix. Windows is not optional; it caught a real fixture defect in
  Milestone 3.
- `npm pack` surface compared before and after; the package-surface fixture
  already enforces the whitelist.

## Explicitly Not In Scope

- `runtime-evidenced` level.
- Any claim of runtime enforcement for any target.
- Writing user-global or managed settings for any target.
- Network egress control for the Claude target — `BLOCKED` in the matrix, and
  a `Bash(curl *)` deny is not an equivalent substitute.
- Changing the five frozen classifications or adding a sixth.
- Executing any agent or external model.

## Open Question Requiring A Decision Before Scope B

Whether the Claude materializer owns the whole `.claude/settings.json` or a
delimited block inside it. The Codex precedent is whole-file ownership, but
`.claude/settings.json` is a file teams already maintain by hand, so whole-file
ownership would refuse to materialize on most real projects. Block-level
ownership weakens the "GovernSeed owns this file" invariant that makes drift
detection simple. This is the only question in this plan whose answer changes
the implementation shape.
