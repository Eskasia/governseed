# Claude Code Policy Capability Matrix

**Read date:** 2026-07-31 (Asia/Taipei)

**Scope:** GovernSeed Milestone 4 Claude Code project-local target

**Source type:** Current official Claude Code documentation at
`https://code.claude.com/docs/en/`; web documentation does not provide a
repository commit SHA

## Purpose

This matrix is the Claude Code counterpart of
`2026-07-29-codex-policy-capability-matrix.md`. It uses the same five
classifications, which are frozen by that document and must not be redefined,
extended, or upgraded here.

It distinguishes:

1. a capability Claude Code documents;
2. what a GovernSeed Adapter can truthfully represent;
3. what would require target materialization, human approval, observation, or
   runtime evidence.

It must not be read as a claim that Claude Code lacks permission, sandbox, or
policy capabilities. GovernSeed deliberately materializes only the restricting
surface.

## Classification

The five classifications are defined in
`2026-07-29-codex-policy-capability-matrix.md` and are used here unchanged:
`enforceable`, `representable-only`, `unsupported`, `requires-human-approval`,
`runtime-evidence-required`.

`materializationStatus` remains orthogonal to classification:
`not-applicable | materializable | deferred`.

## Settings Surface

| Scope | Path | Source |
|---|---|---|
| Managed | `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux/WSL), `C:\Program Files\ClaudeCode\` (Windows), or server-managed | `settings` |
| User | `~/.claude/settings.json` | `settings` |
| Project | `.claude/settings.json` | `settings` |
| Local | `.claude/settings.local.json` (gitignored) | `settings` |

Documented precedence, highest first:

1. Managed (cannot be overridden)
2. Command line arguments
3. Local — `.claude/settings.local.json`
4. Project — `.claude/settings.json`
5. User — `~/.claude/settings.json`

GovernSeed's writable target is the project layer, `.claude/settings.json`,
only.

## Structural Findings That Constrain The Design

### F1. Restriction-only maps exactly onto `deny` and `ask`

> `permissions.allow` rules and `permissions.additionalDirectories` entries in
> a project's `.claude/settings.json` grant capability, so Claude Code applies
> them only after you accept the workspace trust dialog for that workspace.
> Until then, Claude Code reads the rules but doesn't apply them. […] `deny`
> and `ask` rules aren't affected, since they only restrict.
>
> — `permissions`

GovernSeed's materialize invariant is that every emitted value is the strictest
value the key admits. That invariant confines it to `deny` and `ask`, which is
also the subset that does not depend on the workspace trust dialog. Writing
`allow` would both violate the invariant and introduce a trust dependency
GovernSeed cannot observe.

### F2. Rule evaluation order is fixed and specificity-independent

> Rules are evaluated in order: deny, then ask, then allow. The first match in
> that order determines the outcome, and rule specificity doesn't change the
> order.
>
> — `permissions`

A GovernSeed `deny` entry therefore cannot be weakened by a narrower `allow`
in a higher-precedence layer's rule list. This is stronger than the Codex
surface, where writing one key can displace another key's effect.

### F3. A bare tool name removes the tool entirely

> A bare tool name like `Bash` removes the tool from Claude's context entirely,
> so Claude never sees it. Bare-name removal applies to every tool except
> `EndConversation` […] A scoped rule like `Bash(rm *)` leaves the tool
> available and blocks matching calls when Claude attempts them.
>
> — `permissions`

Bare-name denial and scoped denial are different mechanisms with different
blast radius. The Adapter must choose one deliberately per control and record
which it used.

### F4. The shadowing hazard applies to scalar settings, not to permission rules

`.claude/settings.local.json` is gitignored and outranks `.claude/settings.json`,
and managed settings outrank everything and cannot be overridden. A developer
can therefore silently outrank a governed *scalar* setting with a file that
never appears in review.

Permission rules are the exception, and the distinction is load-bearing:

> Permission rules behave differently because they merge across scopes rather
> than override.
>
> — `settings`

A `deny` or `ask` entry GovernSeed writes into `.claude/settings.json` is
therefore merged with, not replaced by, the entries in a higher-precedence
file. Combined with F2 — deny is evaluated first and specificity does not
reorder the rules — no higher layer can remove or weaken a GovernSeed `deny`
by adding rules.

`attest` must draw this line rather than issuing one blanket caveat:
`permissions.deny` and `permissions.ask` entries survive higher layers;
`defaultMode` and the mode locks do not. Managed-settings possibility remains a
permanent caveat for the scalar keys, and its absence is never proof.

### F7. An invalid settings file is rejected whole, which fails open

> This tolerance applies only to managed settings. User, project, and local
> settings files remain strict: a file that fails validation is rejected as a
> whole and reported.
>
> — `settings`

If GovernSeed ever writes an unparseable `.claude/settings.json`, the entire
project layer is dropped — including `deny` entries the team wrote themselves.
That is a fail-open outcome and is the most severe failure mode available to
this target. Any pre-existing file that does not parse must be treated as a
fail-closed refusal, never overwritten.

### F8. Unknown keys are tolerated, but an in-file marker is still wrong

The `$schema` key is optional and exists for editor autocomplete; the published
schema "may not include settings added in the most recent CLI releases, so a
validation warning on a recently documented field does not necessarily mean
your configuration is invalid" — `settings`.

GovernSeed could therefore add an ownership marker key without breaking Claude
Code. It should not: a project that references the official schema would show
the user an editor validation warning on a key GovernSeed invented. The
content-addressed receipt already records ownership, so no in-file marker is
needed.

### F5. Two mode locks are restriction-only and scope-independent

> To prevent `bypassPermissions` or `auto` mode from being used, set
> `permissions.disableBypassPermissionsMode` or `permissions.disableAutoMode`
> to `"disable"` in any settings file. […] `disableBypassPermissionsMode` is
> typically placed in managed settings to enforce organizational policy, but it
> works from any scope.
>
> — `permissions`

Both are restrictions and both are documented to work from the project layer.

### F6. `defaultMode` values

Documented values: `default` (alias `manual`), `acceptEdits`, `plan`, `auto`,
`dontAsk`, `bypassPermissions` — `permissions`.

Only a subset is a restriction relative to `default`. `plan` and `dontAsk`
restrict; `acceptEdits`, `auto`, and `bypassPermissions` relax. A
restriction-only materializer must never emit the relaxing values, and must
treat "the policy asks for no restriction" as "write nothing", not as
"write `default`".

## Control Matrix

Each row records the classification, the project-layer key, and the source.
Rows without a verified official source are marked `BLOCKED` and are not
implementable until resolved.

| Control | Classification | `materializationStatus` | Project-layer key | Source |
|---|---|---|---|---|
| Shell execution restriction | `representable-only` | `materializable` | `permissions.deny` / `permissions.ask` entry scoped to `Bash(...)` | `permissions` |
| Tool removal | `representable-only` | `materializable` | `permissions.deny` bare tool name | `permissions` |
| File read restriction | `representable-only` | `materializable` | `permissions.deny` entry scoped to `Read(...)` | `permissions` |
| File write restriction | `representable-only` | `materializable` | `permissions.deny` entry scoped to `Edit(...)` / `Write(...)` | `permissions` |
| Approval requirement | `requires-human-approval` | `materializable` | `permissions.ask` entry | `permissions` |
| Bypass-mode lock | `representable-only` | `materializable` | `permissions.disableBypassPermissionsMode: "disable"` | `permissions` |
| Auto-mode lock | `representable-only` | `materializable` | `permissions.disableAutoMode: "disable"` | `permissions` |
| Restrictive default mode | `representable-only` | `materializable` | `permissions.defaultMode` limited to `plan` or `dontAsk` | `permissions` |
| Working-directory restriction | `unsupported` | `not-applicable` | `permissions.additionalDirectories` only grants access; there is no documented project-layer key that narrows the working directory below its default | `permissions` |
| Network egress restriction | `BLOCKED` | `BLOCKED` | No verified project-layer settings key for network egress was located in the permissions or settings reference | — |
| Effective-configuration observation | `runtime-evidence-required` | `not-applicable` | No documented project-local artifact reports the merged effective settings | — |
| Workspace trust state | `runtime-evidence-required` | `not-applicable` | The trust dialog is interactive; no documented project-local file records its outcome | `permissions`, `security` |

## BLOCKED Items

1. **Network egress restriction.** The Codex target has
   `[sandbox_workspace_write].network_access`. No equivalent verified
   project-layer key was located for Claude Code. Until an official source is
   found, no network control may be emitted for this target, and the control
   must be reported as `deferred` with a reason code rather than approximated
   through a `Bash(curl *)`-style deny, which is not equivalent.
2. **Antigravity project-local settings surface.** No official documentation
   for an Antigravity project-local settings file was consulted in this pass.
   The Antigravity phase of Milestone 4 cannot begin until an equivalent
   matrix exists with its own sources.

## Non-Claims

- This matrix does not establish that Claude Code loaded, trusted, or applied
  a GovernSeed-written file.
- It does not establish the effective configuration, which depends on managed
  settings and `.claude/settings.local.json` that GovernSeed may not be able to
  read.
- Documented behavior is version-dependent; several cited behaviors carry
  explicit minimum-version notes in the source. Re-verification is required
  before any claim change.
