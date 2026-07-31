# Milestone 4 — Runtime Materialization Parity

**Date:** 2026-07-31 (Asia/Taipei)

**Baseline:** `main@eee0dc5` (Milestone 3, PR #14)

**Status:** Scopes A, B, and C are delivered and merged. Scope D is closed
without code: its entry condition was met and the evidence it produced closes
the scope rather than opening it. See the delivery record below.

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
- **Ownership is entry-level, not whole-file.** Claude Code's own documentation
  describes `.claude/settings.json` as checked into git and shared with the
  team, so the file already existing is the normal case, not the exception.
  Whole-file ownership, the Codex precedent, would refuse to materialize on
  most real projects and make the target inapplicable to its actual audience.
  The ownership rules differ by value shape:
  - **Arrays — `permissions.deny` and `permissions.ask` — use required-entry
    semantics.** The receipt records the exact set of entries GovernSeed
    requires. Drift is a required entry missing. Extra entries are permitted,
    reported, and never removed. This is sound because of the merge and
    evaluation semantics in the matrix, not for convenience: rules merge across
    scopes rather than override (F4), and deny is evaluated first with
    specificity ignored (F2), so an additional entry can only restrict further.
  - **Scalars — `defaultMode`, `disableBypassPermissionsMode`,
    `disableAutoMode` — use no-overwrite semantics.** Write only when the key is
    absent or already equals the required value. A different existing value is a
    fail-closed conflict that names both values for a human to resolve. Do not
    attempt to decide whether a human's value is stricter: `plan` and `dontAsk`
    have no established total order, and building a strictness lattice to skip
    one confirmation would introduce a whole class of judgment errors.
- **Ownership lives in the receipt; no marker key goes into the file.** Unknown
  keys are tolerated, but a project referencing the official settings schema
  would show the user an editor validation warning on a key GovernSeed invented
  (F8). The content-addressed receipt already records which keys and entries are
  owned, and `attest` projects that subset out of the file to compare.
- **A pre-existing file that does not parse is a fail-closed refusal.** Never
  overwrite it. An invalid project settings file is rejected as a whole by
  Claude Code (F7), so writing over a broken file — or writing a broken one —
  would drop the entire project layer including the team's own `deny` entries.
  That is fail-open, the one outcome a governance tool must not produce.
- Reuses without change: no-overwrite ownership, receipt-last write order,
  content-addressed identity, canonical JSON hashing, deterministic double-run
  zero diff, dry-run zero writes.
- `MAT-` identity stays input-only: `sha256Canonical({policyId, policyHash,
  target, plannedKeys})`.

**Acceptance:** materialize twice produces zero diff and no second receipt;
dry-run writes nothing; the negative tests for each protected path fail closed;
the emitted file contains no `allow` and no `additionalDirectories`;
materializing into a file that already carries hand-written `deny` entries
preserves every one of them; a scalar conflict fails closed and names both
values; an unparseable existing file is refused rather than replaced.

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
- New drift and shadowing findings, scoped by value shape rather than issued as
  one blanket caveat:
  - `.claude/settings.local.json` exists → report shadowing **for the scalar
    keys only**. Permission rules merge across scopes rather than override, so a
    local file cannot remove a GovernSeed `deny` or `ask` entry (F4).
  - Managed settings may exist and are not readable from the project layer →
    permanent caveat for the scalar keys, never resolved to "absent".
  - A required `deny` or `ask` entry is missing from the file → drift.
  - Extra `deny` or `ask` entries → reported as additional restrictions, not
    drift, and never removed.
- `claim` stays hardcoded `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.
- `knownLimitations` and `precedenceCaveat` stay required and non-empty.

**Acceptance:** attest reports the three-way comparison for the Claude target;
a planted `.claude/settings.local.json` produces the shadowing finding; the
schema rejects any level above `project-layer-observed`.

## Scope D — Antigravity

Blocked. Entry condition: an Antigravity capability matrix with official
sources and its own `BLOCKED` list, in the same shape as the Claude matrix.
Until then this scope produces no code and no claim.

**Closed 2026-07-31.** The entry condition was met by
`docs/research/2026-07-31-antigravity-policy-capability-matrix.md`, and the
matrix's finding closes the scope instead of opening it: **no row is
materializable**. Antigravity documents a restriction surface comparable to the
other two targets — `action(target)` with `Deny > Ask > Allow` over
`read_file`, `write_file`, `command`, `read_url`, `execute_url`, `unsandboxed`,
and `mcp` — but the only documented file carrying those keys is
`~/.gemini/antigravity-cli/settings.json`, which is user-global and therefore
outside what materialization may write. The one project-local restriction point,
a `hooks.json` `PreToolUse` handler returning `decision: "deny"`, is `BLOCKED`
on four counts: its workspace path appears only after `e.g.`, its precedence
against the user-global file is unstated, whether it loads without a user trust
decision is unstated, and the handler is an executed shell command rather than
declarative configuration. `.agents/rules` is project-local and documented but
carries no documented ability to deny an action, so it is `representable-only`
and stays governance markdown.

Reopening requires new official documentation, not a new plan.

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

## Resolved Design Question

**Decided 2026-07-31: entry-level ownership, recorded in the receipt.** The
rules are in Scope B.

## Delivery Record

Each acceptance item is recorded against the test that proves it, so the status
above is checkable rather than asserted.

| Scope | Acceptance item | Proving test |
|---|---|---|
| A | Codex policy and adapter bytes unchanged by the generalization | `tests/policy-compiler/codex-output-identity.test.mjs` — `the codex policy artifact is byte-identical to the pinned baseline`, `the codex adapter artifact is byte-identical to the pinned baseline` |
| A | Per-target registry with path, matrix, materializer, and caveats | `scripts/lib/target-registry.mjs`, registering `codex` and `claude` |
| B | Double run writes nothing and produces no second receipt | `claude-materialize-contracts.test.mjs` — `a second materialize run writes nothing and produces no second receipt` |
| B | Dry-run writes nothing | `dry-run performs every check and writes nothing at all` |
| B | Never writes local, user-global, or managed scope | `materialize writes only the project settings file, never the local or user-global scope`, `an existing settings.local.json is never read as ownership and never written` |
| B | No `allow`, no `additionalDirectories` | `the emitted settings file is restriction-only and grants nothing` |
| B | Hand-written `deny` entries preserved | `hand-written deny entries in an existing settings file are all preserved` |
| B | Scalar conflict fails closed naming both values | `a conflicting scalar fails closed and names both values` |
| B | Unparseable existing file refused, never replaced | `an unparseable existing settings file is refused, never replaced` |
| B | Ownership in the receipt, no marker key in the file | `ownership is recorded in the receipt and never as a marker key in the file` |
| C | Level ceiling cannot be raised | `claude-attest-contracts.test.mjs` — `no argument or environment variable can raise the claude level` |
| C | Claude-specific precedence caveat | `the claude precedence caveat states the documented layer order` |
| C | Missing required entry is drift; extra entries are not | `a removed required deny or ask entry is drift`, `extra deny entries are additional restrictions, not drift, and are never removed` |
| C | Planted `settings.local.json` shadows scalars only | `a planted settings.local.json is reported as shadowing the governed scalars only` |
| C | Attest is read-only | `attest is read-only: two claude runs leave the project byte-identical` |
| D | — | No code. See the scope section above. |

Two items in Scope B went beyond the written acceptance list and are recorded
here so the extra surface is not invisible: `materialize refuses a settings path
that is a symlink`, and `the network control is deferred with a reason, never
approximated as a Bash deny` — the latter enforcing the "Explicitly Not In
Scope" line about `Bash(curl *)`.

The question was whether the Claude materializer owns the whole
`.claude/settings.json` or something narrower. Whole-file ownership is the Codex
precedent and keeps drift detection trivially simple, but Claude Code documents
this file as checked into git and shared with the team, so refusing when it
already exists would make the target unusable on the projects it exists for.

What made entry-level ownership defensible rather than merely convenient was
the merge semantics: permission rules merge across scopes instead of
overriding, and deny is evaluated first with specificity ignored. Extra entries
can only restrict further, so "missing is drift, extra is fine" holds as a
property of the runtime rather than as a relaxation of the invariant. That
argument covers the arrays only, which is why the scalars keep strict
no-overwrite semantics instead.
