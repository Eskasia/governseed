# Antigravity Policy Capability Matrix

**Read date:** 2026-07-31 (Asia/Taipei)

**Scope:** GovernSeed Milestone 4 Scope D — Antigravity project-local target

**Source type:** Current official Antigravity documentation at
`https://antigravity.google/docs/`; web documentation does not provide a
repository commit SHA

## Purpose

This matrix is the Antigravity counterpart of
`2026-07-29-codex-policy-capability-matrix.md` and
`2026-07-31-claude-code-policy-capability-matrix.md`. It uses the same five
classifications, which are frozen by the Codex document and must not be
redefined, extended, or upgraded here.

It exists to satisfy the entry condition the Claude matrix records for the
Antigravity phase: an Antigravity capability matrix with official sources and
its own `BLOCKED` list. It is not itself an authorization to write an
Antigravity materializer.

It must not be read as a claim that Antigravity lacks permission, sandbox, or
policy capabilities. The documented surface is substantial. What this matrix
records is narrower: which of it GovernSeed may write to, under a boundary that
permits project-local target settings only.

## Classification

The five classifications are defined in
`2026-07-29-codex-policy-capability-matrix.md` and are used here unchanged:
`enforceable`, `representable-only`, `unsupported`, `requires-human-approval`,
`runtime-evidence-required`.

`materializationStatus` remains orthogonal to classification:
`not-applicable | materializable | deferred`.

## Settings Surface

| Scope | Path | Restricting keys documented? | Source |
|---|---|---|---|
| CLI user-global settings | `~/.gemini/antigravity-cli/settings.json` | yes — `permissions.allow`, `permissions.deny`, `permissions.ask` | `cli/permissions`, `cli/settings` |
| CLI user-global keybindings | `~/.gemini/antigravity-cli/keybindings.json` | no | `cli/settings` |
| IDE user-global application data | `~/.gemini/antigravity/` | no | `ide/settings` |
| Global rules | `~/.gemini/GEMINI.md` | no — natural-language guidance | `ide/rules` |
| Workspace rules | `.agents/rules` (back-compat `.agent/rules`) | no — natural-language guidance | `ide/rules` |
| Hooks | `hooks.json` in "your customization directory (e.g., `.agents/` in your workspace or `~/.gemini/config/`)" | yes — `PreToolUse` handler may return `decision: "deny"` | `hooks`, `ide/hooks` |
| Browser URL allowlist | "a local text file"; path not stated | path not documented | `ide/allowlist-denylist` |

No documented project-local file carries declarative permission rules. The only
documented declarative permission file is user-global.

## Structural Findings That Constrain The Design

### F1. The rule grammar is restriction-capable and precedence-ordered

Permission rules use `action(target)`. Documented actions: `read_file`,
`write_file`, `command`, `read_url`, `execute_url`, `unsandboxed`, `mcp`.
Precedence is `Deny > Ask > Allow`, stated with the worked example that
`command(*)` in ask beats `command(git)` in allow. This is the same
restriction-only shape GovernSeed already compiles for Codex and Claude Code.

Source: `permissions`, `cli/permissions`.

### F2. Every declarative permission surface is user-global

The `permissions.allow` / `permissions.deny` / `permissions.ask` keys live in
`~/.gemini/antigravity-cli/settings.json`. The CLI settings page documents no
project-local or workspace-level file that overrides it. The Antigravity 2.0
settings overview describes a Global-versus-Project scope hierarchy but states
no file path for either scope.

GovernSeed's materialization boundary forbids writing user-global or managed
settings. So the surface that matches GovernSeed's compiler output exactly is
the one surface GovernSeed may not write.

Source: `cli/permissions`, `cli/settings`, `settings`.

### F3. The one project-local restriction surface executes a shell command

`hooks.json` registers handlers whose `command` field is, verbatim, "The shell
command to execute." A `PreToolUse` handler prints JSON on stdout and its
`decision` field takes `allow`, `deny`, `ask`, or `force_ask`, where `deny`
blocks execution immediately.

This is a genuine project-local restriction point, and it is categorically
different from what GovernSeed materializes elsewhere. Codex and Claude Code
targets receive declarative configuration. An Antigravity hook target would
require GovernSeed to write an executable policy script into the user's
repository and register it to run before every tool call. That is a larger
commitment than this matrix authorizes, and it is not established here.

Source: `hooks`, `ide/hooks`.

### F4. The workspace hooks path is documented only by example

The sole location sentence is: "Hooks are configured in a `hooks.json` file
located in your customization directory (e.g., `.agents/` in your workspace or
`~/.gemini/config/`)." The `e.g.` makes `.agents/` an illustration of a
customization directory, not a specified path. No page states the resolution
rule for "your customization directory."

Writing to an inferred path is exactly what the sourcing rule forbids.

Source: `hooks`, `ide/hooks`.

### F5. Hook precedence and trust are undocumented

No page states what happens when a workspace `hooks.json` and a user-global
`hooks.json` both exist — whether they merge, which wins, or in what order
handlers run. No page states whether a workspace `hooks.json` is loaded without
user opt-in or requires a trust decision first.

Both are prerequisites for an honest attestation. Without the precedence rule,
GovernSeed cannot report whether what it wrote is what applies; without the
trust rule, it cannot report whether the file was loaded at all.

Source: `hooks`, `ide/hooks` — absence of statement.

### F6. Workspace rules are project-local but instruction-only

`.agents/rules` is documented as project-local markdown, with `.agent/rules`
retained for backward compatibility. Rules are "manually defined constraints for
the Agent to follow" that "guide the agent to follow behaviors particular to
their own use cases and style." The documentation does not state that a rules
file can deny a tool call, a command, a file access, or a network request.

This is the governance-markdown layer GovernSeed already writes, not a policy
target. Classifying it any higher would restate the displacement hazard the
enforcement boundary exists to prevent.

Source: `ide/rules`.

### F7. GovernSeed already writes into `.agents/`

The Antigravity adapter emits `.agents/AGENTS.md` and `.agents/skills/`. If the
customization directory does resolve to `.agents/`, then any future hooks target
writes into a directory GovernSeed already owns, alongside files a user may also
maintain. That raises a collision and ownership question this matrix does not
settle, and it must be settled before, not during, implementation.

Source: repository — `examples/template-adoption/antigravity-base/.agents/`.

### F8. The browser denylist is server-side and fails closed

URL denial is evaluated server-side; "If the server is unavailable, access is
denied by default," and "the denylist always takes precedence: you cannot
allowlist a URL that appears on the denylist." The allowlist is "a local text
file" initialized with just `localhost`, whose path the page does not state.

Fail-closed default is favourable, but it is not a surface GovernSeed writes,
and the allowlist file cannot be targeted without a documented path.

Source: `ide/allowlist-denylist`.

### F9. IDE agent settings are documented as UI labels only

Terminal Command Auto Execution, Agent Non-Workspace File Access, Strict Mode,
Terminal Sandboxing, and Sandbox Allow Network are documented by their interface
labels. No page states their JSON key names or the file that stores them.

Source: `ide/settings`, `agent-settings`.

## Control Matrix

Each row records the classification, the project-layer key, and the source.
Rows without a verified official project-local source are marked `BLOCKED` and
are not implementable until resolved.

| Control | Classification | `materializationStatus` | Project-layer key | Source |
|---|---|---|---|---|
| Shell execution restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `command(...)`, but only in the user-global `~/.gemini/antigravity-cli/settings.json`; no project-local equivalent is documented | `cli/permissions` |
| File read restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `read_file(...)` at the user-global layer only | `cli/permissions` |
| File write restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `write_file(...)` at the user-global layer only | `cli/permissions` |
| Network egress restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `read_url(...)` and `execute_url(...)` at the user-global layer only | `cli/permissions` |
| MCP restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `mcp(...)` at the user-global layer only | `cli/permissions` |
| Sandbox escape restriction | `unsupported` | `not-applicable` | `permissions.deny` accepts `unsandboxed(...)` at the user-global layer only | `cli/permissions` |
| Approval requirement | `unsupported` | `not-applicable` | `permissions.ask` is user-global only | `cli/permissions` |
| Pre-tool-call denial | `BLOCKED` | `BLOCKED` | `hooks.json` `PreToolUse` handler returning `decision: "deny"` is project-local and restriction-capable, but the workspace path is given only as an example, precedence against the user-global file is unstated, and the handler is an executed shell command rather than declarative configuration | `hooks`, `ide/hooks` |
| Behavioral guidance | `representable-only` | `not-applicable` | `.agents/rules` markdown; documented as guidance, with no documented ability to deny an action | `ide/rules` |
| Working-directory restriction | `BLOCKED` | `BLOCKED` | Agent Non-Workspace File Access is documented as a UI setting with no stated key name or file | `ide/settings`, `agent-settings` |
| Terminal auto-execution mode | `BLOCKED` | `BLOCKED` | Request Review / Always Proceed is documented as a UI setting with no stated key name or file | `agent-settings` |
| Browser URL restriction | `unsupported` | `not-applicable` | Denial is server-side; the local allowlist file's path is not documented | `ide/allowlist-denylist` |
| Effective-configuration observation | `runtime-evidence-required` | `not-applicable` | No documented project-local artifact reports the merged effective settings | — |
| Workspace trust state | `runtime-evidence-required` | `not-applicable` | No documented project-local file records whether a workspace customization directory was loaded or trusted | — |

No row is `materializable`. Scope D therefore produces no code and no claim,
and the Milestone 4 plan's blocked status for it stands.

## BLOCKED Items

1. **Project-local permission settings file.** The `action(target)` grammar and
   the `Deny > Ask > Allow` precedence are documented and would map cleanly onto
   the existing compiler output, but the only documented file carrying them is
   user-global. Until an official project-local or workspace-scoped permissions
   file is documented, no Antigravity permission control may be emitted.
2. **Workspace `hooks.json` path.** `.agents/` appears only after `e.g.`. The
   resolution rule for "your customization directory" is not stated. No hook may
   be written to an inferred path.
3. **Hook precedence and merge order.** Undocumented for the case where both a
   workspace and a user-global `hooks.json` exist. Required before any
   attestation could describe what applies.
4. **Workspace hook trust and load conditions.** Undocumented whether a
   workspace `hooks.json` is honoured without an explicit user trust decision.
   Required before any attestation could describe whether the file was loaded.
5. **JSON key names for IDE agent settings.** Terminal Command Auto Execution,
   Agent Non-Workspace File Access, Strict Mode, Terminal Sandboxing, and
   Sandbox Allow Network are documented as interface labels only.
6. **Browser allowlist file path.** Documented as "a local text file" with no
   stated location.
7. **`.agents/` ownership.** GovernSeed already writes `.agents/AGENTS.md` and
   `.agents/skills/`. Whether GovernSeed may also own a policy artifact in that
   directory, and how it would coexist with a user's own, is unresolved.

## Non-Claims

- This matrix does not establish that Antigravity loaded, trusted, or applied
  any GovernSeed-written file.
- It does not establish the effective configuration, which depends on
  user-global settings GovernSeed does not read and does not write.
- It does not authorize an Antigravity materializer. Item 1 and items 2 through
  4 are each independently sufficient to block one.
- It does not claim Antigravity is less restrictable than Codex or Claude Code.
  The documented restriction surface is comparable; what differs is that its
  declarative form sits at a layer GovernSeed's boundary excludes.
- Documented behavior is version-dependent and the source carries no commit SHA.
  Re-verification is required before any claim change.
