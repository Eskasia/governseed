# Codex Policy Capability Matrix

**Read date:** 2026-07-29 (Asia/Taipei)

**Scope:** GovernSeed Phase 2 Codex project-local JSON Adapter

**Source type:** Current official Codex documentation; web documentation does
not provide a repository commit SHA

## Purpose

This matrix distinguishes:

1. a capability Codex documents;
2. what the Phase 2 GovernSeed Adapter can truthfully represent;
3. what would require target materialization, human approval, observation, or
   runtime evidence.

It must not be read as a claim that Codex lacks sandbox, approval, project
configuration, or command-rule capabilities. GovernSeed intentionally does
not materialize those runtime surfaces in Phase 2.

## Classification

| Classification | Meaning here |
|---|---|
| `enforceable` | GovernSeed can mechanically enforce the specifically named compiler-local property. It does not describe Codex runtime behavior unless stated. |
| `representable-only` | Adapter JSON can express a control or guidance, but cannot establish that Codex loaded or followed it. |
| `unsupported` | The Phase 2 Adapter has no truthful project-local mapping or observation for this control. |
| `requires-human-approval` | A person must authorize the governed action. A generated instruction or required-approval mode is not approval evidence. |
| `runtime-evidence-required` | Only observed effective settings or real execution evidence can support an applied/enforced claim. |

## Official Capability Facts

- Codex describes sandbox mode and approval policy as separate security layers.
  For local CLI/IDE use, the sandbox can limit filesystem writes and network
  access, while approval policy determines when Codex asks before an action.
  See [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security.md).
- Codex supports project-scoped `.codex/config.toml`, but project layers load
  only for trusted projects. Multiple project layers, user/system layers, and
  command-line settings participate in configuration behavior. Some
  credential/provider/telemetry keys are explicitly ignored in project config.
  See [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced.md)
  and the [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference.md).
- Codex loads `AGENTS.md` as layered instructions at session start. Closer
  project guidance can override broader guidance, and a byte limit applies.
  This is an instruction surface, not the OS sandbox. See
  [Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md).
- Codex command rules can return `allow`, `prompt`, or `forbidden`, with the
  most restrictive matching decision winning. The official documentation
  marks rules as experimental and describes them as controlling commands
  outside the sandbox. See [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md).
- Codex documents permissions/sandbox profiles as runtime security controls;
  effective behavior depends on the active session and configuration. See
  [Permissions](https://learn.chatgpt.com/docs/permissions.md).

## Capability Matrix

| Control | Documented Codex surface | Phase 2 classification | Adapter treatment | What is required for a stronger claim |
|---|---|---|---|---|
| Project instructions | `AGENTS.md` discovery and precedence | `representable-only` | Record the normalized repository `AGENTS.md` reference/hash and concise guidance. Do not rewrite it. | Observe the instruction sources loaded by a real Codex session; following instructions still is not technical enforcement. |
| File write scope | OS sandbox modes and filesystem/permission configuration | `representable-only`, `runtime-evidence-required` | Preserve neutral filesystem mode/scope and state that Adapter JSON does not set the sandbox. | Materialize a reviewed native setting, resolve trust/precedence, then observe the effective setting or runtime evidence. |
| Shell execution | Sandbox plus approval policy; experimental command rules for outside-sandbox commands | `representable-only`, `runtime-evidence-required` | Record allowed/denied/approval guidance and unsupported native enforcement. Do not emit `.rules`. | Validate active sandbox/approval/rules and collect claim-matched runtime evidence. |
| Network access | `sandbox_workspace_write.network_access`; optional constrained network proxy when network is enabled | `representable-only`, `runtime-evidence-required` | Preserve `deny` or scoped modes; never describe Adapter JSON as egress control. | Observe effective config and test the real runtime boundary under a separately approved Attestation/evidence contract. |
| Destructive commands | Approval policy, tool destructive annotations, and experimental `prompt`/`forbidden` rules | `requires-human-approval`, `runtime-evidence-required` | Emit prohibited-action and approval guidance; a missing governed approval remains a doctor finding. | Explicit human approval plus real active-policy/runtime evidence for the attempted action. |
| Credential access | Credentials and auth state live in user/global state; project config cannot override credential-redirecting/provider-auth keys | `unsupported` | Preserve credential `deny`/approval requirements in the neutral manifest and unsupported list. Never read credentials or generate a credential setting. | A separately approved runtime isolation design and evidence; project Adapter JSON alone cannot prove isolation. |
| Approval requirements | Runtime approval policy and side-effect/destructive tool approval behavior | `requires-human-approval`, `runtime-evidence-required` | List which controls require approval and the required evidence reference. Never create approval evidence. | An explicit human approval record for the governed action and, for enforcement claims, runtime evidence that approval policy applied. |
| Skill invocation | Skills are discovered/invoked by Codex behavior and instructions | `unsupported` for authority enforcement | Do not generate or install Skills. A Skill name never grants permission. | A separate Adapter/Skill contract plus authority checks; runtime evidence is still needed for invocation claims. |
| Agent/subagent invocation | Codex has agent configuration/runtime features | `unsupported` for authority enforcement | Do not create an Agent, persona, role config, scheduler, or invocation. Delivery Role remains governance metadata. | A separate runtime integration and evidence contract outside this PR. |
| Generated file ownership | GovernSeed bounded path, full hash, content-addressed path, and no-overwrite transaction | `enforceable` by the compiler | Preflight owner/hash, block unknown content, and list generated files in Adapter/receipt. | No Codex runtime claim follows; Phase 3 may attest materialized bytes. |
| Compiler logging/receipt | GovernSeed receipt-last local transaction | `enforceable` for transaction provenance only | Receipt exact-binds inputs/outputs/target and is written last. It excludes private/runtime logs. | Codex execution or compliance claims require separate real runtime evidence. |
| Codex session logging | Codex local/session log configuration | `unsupported`, `runtime-evidence-required` | Do not read, configure, or copy Codex logs. | Explicitly scoped observation in Phase 3 or a separate runtime-evidence workflow. |
| User-global configuration boundary | GovernSeed project-root path boundary; Codex user state is under its user/global home | `enforceable` by the compiler | Reject reads/writes outside project root and never inspect `~/.codex`/`CODEX_HOME`. | Compiler tests prove only GovernSeed behavior, not the behavior of a later external tool. |
| Project trust | Codex loads project config/rules/hooks only for trusted projects | `unsupported` for setting trust, `runtime-evidence-required` | Compatibility metadata states trust is external and unobserved. | A real Codex observation must establish whether the project layer loaded. |
| Configuration precedence | Project/user/system/session/admin layers | `unsupported` in Phase 2, `runtime-evidence-required` | Do not predict the effective value or claim that a candidate wins precedence. | Phase 3 must observe effective project-local target settings under a defined version/session. |
| External content handling | Instructions and network/web-search settings can reduce exposure, but content remains untrusted input | `representable-only` | Emit untrusted-content guidance and preserve any neutral network restriction. | Runtime/network observation and claim-matched evidence. |
| Provider retention | Provider/service policy, not a GovernSeed/Codex project-local setting established by this Adapter | `unsupported` | Preserve the neutral retention control and mark it unsupported. | Provider-specific contractual evidence outside the core compiler. |
| Verification commands | Repository instructions can name commands; GovernSeed can record expected evidence | `representable-only` | List canonical verification commands/references without executing Codex. | Native command results are evidence for the command outcome, not proof that Codex always follows policy. |

## Why the Adapter Does Not Emit `.codex/config.toml`

Codex documents real project-scoped configuration. Emitting it is deferred
because all of the following need their own reviewed contract:

- project trust determines whether the layer loads;
- closer project files, CLI/session values, user/system settings, and
  administrator requirements may change the effective value;
- `.codex/config.toml` may already be user-owned;
- some security-adjacent keys are intentionally unavailable to project config;
- generating a file is not observing effective behavior;
- Phase 2 has no Attestation model.

The Adapter therefore records candidate mappings and limitations in:

```text
.agent-governance/adapters/codex/<policy-id>.json
```

That file is machine-readable GovernSeed output, not an automatically loaded
Codex configuration file.

## Why the Adapter Does Not Emit `.codex/rules/`

The official Rules documentation marks command rules experimental. Their
prefix and shell-wrapper semantics are narrower than the complete neutral
policy, and they govern a specific execution decision surface rather than
filesystem, credentials, retention, roles, and evidence as a whole. Emitting
rules now would:

- create a second policy owner;
- require versioned translation and ownership/merge behavior;
- risk an incomplete match that looks stronger than it is;
- still require project trust and effective-runtime evidence.

The manifest keeps command restrictions. The Phase 2 Adapter marks native rule
materialization unsupported.

## Doctor Interpretation

- `CODEX_CONTROL_NOT_ENFORCEABLE` and
  `POLICY_UNSUPPORTED_CONTROL` are honest warnings for a valid candidate.
- A high-risk missing input, attempted privilege expansion, missing required
  approval, source/hash mismatch, owner conflict, path/privacy violation, or
  partial transaction is an error and blocks the relevant strict gate.
- Doctor does not upgrade `representable-only` to `enforceable`.
- A clean doctor result means local artifacts satisfy the declared contract;
  it does not mean Codex enforced the policy.

## Source and License Treatment

The matrix paraphrases current official documentation and links each source.
No Codex program code, substantial documentation text, configuration file,
prompt, screenshot, logo, or trademark asset is copied. No third-party notice
is required for these citations. A future native Adapter must re-check current
official docs and versions rather than treating this dated matrix as permanent
runtime truth.
