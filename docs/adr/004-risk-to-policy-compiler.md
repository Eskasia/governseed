# ADR-004: Deterministic Risk-to-Policy Compiler and Codex Adapter

## Status

Accepted for Phase 2 on 2026-07-29 by the user's implementation request.

## Context

Milestone 1 established validated project-local risk profiles, human-confirmed
decisions, deterministic role assignments, source-locked Governance Packs, and
the modular-core/Adapter boundary. The next Evidence Graph step is `POL`:

```text
SRC → REQ → DEC → AC → TASK → ROLE → POL → EVD → ATT
```

A Policy Compiler——將已確認的風險、專案規則、角色權限上限與 Governance
Pack，轉換成中立 policy manifest 及特定 Agent 工具的 project-local 設定。

Phase 2 must compile that neutral policy without turning GovernSeed into an
Agent runtime, adding credentials or network access, writing user-global
configuration, or implying that generated text is an operating-system
sandbox. Codex exposes project instructions, project-scoped configuration,
sandbox settings, approval policies, and experimental command rules, but
whether those surfaces load and what finally applies depends on project trust,
configuration precedence, session arguments, user/admin configuration, and the
running Codex version.

## Decision

Implement the compiler inside the existing modular monolith as a pure,
deterministic core plus one thin Codex Adapter.

The core owns:

- validation and canonicalization of governed inputs;
- the most-restrictive policy meet;
- privilege-expansion and conflict detection;
- stable IDs, canonical JSON, and SHA-256 hashes;
- target-independent restriction decisions and modes;
- safe project-local transaction planning and doctor findings.

The Phase 2 Schema is intentionally versioned for the Codex-only target:
`targetSupport` records Codex support classifications and `targets` contains
only `codex`. Adding another target requires a separately reviewed Schema and
Adapter change; this ADR does not claim that the version-1 artifact is already
a generic multi-target contract.

An Adapter——把中立治理資料轉換成特定工具格式的薄層；不得重複核心決策邏輯或執行 Agent。

The Codex Adapter receives an already resolved manifest and emits only a closed
JSON artifact under `.agent-governance/adapters/codex/`. It records canonical
repository instruction references, approval and verification guidance,
prohibited-action guidance, mapped controls, unsupported controls, and
compatibility facts. It cannot grant authority or reinterpret the policy.

Phase 2 deliberately does not write `.codex/config.toml`, `.codex/rules/`,
`AGENTS.md`, or any user-global file. This avoids:

- overwriting user-owned project configuration;
- treating a trusted-project condition as guaranteed;
- ignoring closer, session, user, or administrator precedence;
- depending on experimental rules or permissions profiles;
- claiming effective settings without Attestation.

Codex supports the underlying runtime capabilities, but the Phase 2 Adapter
does not materialize or observe them. Its statements therefore remain
`representable-only`, `requires-human-approval`, `unsupported`, or
`runtime-evidence-required` as recorded in the capability matrix.

## Canonical Inputs

Compilation reads only bounded project-local governed artifacts:

1. one valid assessed `risk-profile.json`;
2. the normalized relative reference and SHA-256 of canonical `AGENTS.md`;
3. explicit `packs.lock.json` and `source-lock.json` files, including valid
   empty sets, with both hashes always contributing to policy identity;
4. active decisions only when their imported result has an exact
   `human-confirmation.json`; these are provenance, not permission prose;
5. applicable role assignments and their granted permission ceilings,
   including any exact project-local, source-locked specialist catalog they
   reference;
6. active Packs whose artifact, lock entry, source-lock entry, revision,
   license, and hash exact-match.

Free text in `AGENTS.md`, a decision, or an ADR is never guessed into a
permission mode. A policy-relevant human choice must first be represented in a
validated structured input.

Unknown or incomplete governed input blocks a candidate manifest. Inactive,
suspended, retired, rejected, superseded, or unpinned sources do not
participate. Compilation never reads `.agent-governance/local/`.

## Restriction Meet

Authority provenance is recorded in this order:

```text
user-confirmed governance
→ assessed risk profile
→ canonical AGENTS reference
→ active human-confirmed decisions
→ role permission ceiling
→ active optional Packs
→ target defaults
```

That order selects the canonical source within a source class; it never lets a
later source widen an earlier restriction. Every contributing mode is combined
using:

```text
deny
→ require-approval
→ constrained-allow
→ allow
→ advisory
```

The effective mode is the most restrictive meet. Role requests are intersected
with the project ceiling. Packs and target defaults may only narrow. An
attempted widening emits `POLICY_PRIVILEGE_EXPANSION` and blocks compilation.
Unsupported target controls remain present in the manifest and Adapter.

A Pack control scoped to one `TASK-*` retains that scope when exactly one
active task is being compiled. Version 1 blocks a task-scoped Pack with
`POLICY_CONFLICT` when multiple tasks are active because the aggregate manifest
cannot truthfully represent different per-task modes. Each Pack mechanical or
human-review check is also retained as a deterministic `EVD-PACK-*` evidence
obligation; Pack metadata alone never satisfies the check.

If the effective `generatedArtifacts` control is `deny`, dry-run may still
return a no-write preview, but a non-dry-run compile is blocked with
`POLICY_CONFLICT`. Approval cannot override a deny.

## Identity and Time

Canonical JSON uses recursively sorted object keys, deterministic array order,
portable relative paths, normalized `/` separators, UTF-8, LF, and exactly one
final newline.

- `policyId` is `POL-` plus the first 12 uppercase hexadecimal characters of
  the canonical policy seed digest, excluding the self-referential `policyId`.
- `compileId` is `COMPILE-` plus the first 12 uppercase hexadecimal characters
  of the canonical transaction identity digest.
- Full lowercase SHA-256 values remain in hash fields; short IDs are labels,
  not integrity proofs.
- `generatedAt` is required and set to `null` in the canonical manifest. No
  wall clock enters policy identity.
- `compiledAt` exists only in the receipt. An unchanged completed transaction
  reuses its existing receipt rather than rewriting time.

The policy and Adapter are immutable content-addressed artifacts. A content
change creates a new identity; a same-path content mismatch is drift, not an
update opportunity.

## Atomic Project-Local Transaction

The only output paths are:

```text
.agent-governance/policies/<policy-id>.json
.agent-governance/adapters/codex/<policy-id>.json
.agent-governance/receipts/<compile-id>.json
```

The compiler preflights every path and parent, rejects traversal, absolute
paths, symlinks, hardlinks, parent replacement, oversized/invalid UTF-8, and
non-GovernSeed owner conflicts. It stages same-directory temporary files,
flushes file data, rechecks parent identity, promotes content-addressed
artifacts with no-replace semantics, and writes the receipt last.

Immediately before the receipt commit marker, the compiler revalidates the
policy and Adapter bytes, ownership, hashes, and parent identities. A changed
or unknown replacement is preserved and blocks the receipt.

The shared artifact writer also rechecks every parent component after its
final link or rename. A detected parent swap removes only the newly linked
identity, or restores the exact pre-replacement identity, before failing.

Receipt existence is the commit marker for a non-dry-run transaction. A policy
or Adapter without its exact receipt is partial output and never means
successful compilation. A failed transaction removes only newly created,
hash-matching GovernSeed-owned outputs; it never deletes or overwrites unknown
files. Doctor reports crash leftovers, drift, and stale inputs.

`--dry-run` builds and validates the complete in-memory plan but performs no
directory creation, temporary write, rename, cleanup, or receipt write.

## Meaning of Candidate and Compiled

`candidate` on a manifest or Adapter means that governed inputs were complete,
the restriction meet was valid, and the output satisfied its local contract.
`compiled` on the CLI means that the receipt-last local transaction completed.
Neither means that Codex loaded, enforced, or complied with the policy.

Attestation——比對宣告政策、編譯輸出與可觀察目標設定是否一致；不代表 Agent Runtime 一定遵守該政策。

Attestation is deferred to Phase 3. A compile receipt proves only the local
compiler transaction and output hashes.

## Consequences

- The core remains dependency-free on Node.js 20 standard-library APIs.
- The canonical manifest remains the only policy owner; its restriction
  decisions are target-independent while its version-1 support annotations are
  Codex-specific.
- The Codex Adapter is short, replaceable, and honest about unsupported
  controls.
- Compilation is offline, project-local, deterministic for policy artifacts,
  and safe to repeat.
- GovernSeed does not execute Codex, read credentials, inspect `~/.codex`, or
  modify global settings.
- Some Codex controls remain guidance until a later, separately reviewed
  materialization and Attestation design exists.

## Alternatives Considered

### Generate `.codex/config.toml`

Rejected for Phase 2. Codex documents project-scoped configuration, but it
loads only for trusted projects and participates in a larger precedence model.
Writing it would also introduce ownership/merge semantics and an enforcement
claim that this milestone cannot verify.

### Generate project-local `.codex/rules/`

Rejected for Phase 2. Codex command rules are experimental, apply to commands
outside the sandbox, and require careful prefix semantics. They cannot encode
the complete neutral policy and would create a second mutable policy surface.

### Append policy text to `AGENTS.md`

Rejected. `AGENTS.md` is canonical user-owned governance. Appending generated
text risks duplication and still provides guidance rather than technical
enforcement.

### Write user-global Codex configuration

Rejected. It expands scope beyond the governed project, risks credential and
state exposure, and violates the project-local product boundary.

### Combine compilation and Attestation

Rejected. A generated candidate and an observed effective setting are
different evidence levels. Combining them would overstate runtime guarantees.

## Reopen Conditions

Reopen this ADR before emitting a Codex-native runtime setting, modifying
`AGENTS.md`, adding another target Adapter, allowing target logic to change the
restriction meet, writing user-global state, accessing credentials, or making
any materialized/observed/runtime-enforced claim.
