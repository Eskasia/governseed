# Risk-to-Policy Compiler

The GovernSeed Policy Compiler——將已確認的風險、專案規則、角色權限上限與
Governance Pack，轉換成中立 policy manifest 及特定 Agent 工具的
project-local 設定。

Phase 2 supports one target: a Codex project-local JSON Adapter. It does not
execute Codex or configure a Codex runtime.

## What It Produces

```text
.agent-governance/policies/POL-<12 HEX>.json
.agent-governance/adapters/codex/POL-<12 HEX>.json
.agent-governance/receipts/COMPILE-<12 HEX>.json
```

- The policy manifest is the canonical policy owner. Its restriction decisions
  are target-independent; its version-1 target-support annotations are
  intentionally Codex-specific.
- The Codex Adapter is a thin target-specific candidate and limitation map.
- The receipt binds input/output hashes and is written last.

Receipt existence marks a completed local compile transaction. It does not
show that Codex loaded or followed the policy.

## Command

Preview without writing:

```bash
agent-governance compile ./my-project --target codex --dry-run
```

Create project-local artifacts:

```bash
agent-governance compile ./my-project --target codex
```

Machine-readable output:

```bash
agent-governance compile ./my-project --target codex --dry-run --json
```

With `--json`, stdout contains exactly one closed JSON object. Diagnostics use
stderr.

## Required Governed Inputs

The compiler uses only bounded project-local files. Required inputs are:

- an assessed `.agent-governance/risk-profile.json` with at least one active
  task, no open questions, and complete risk, deliberation, reason-code, and
  evidence fields for every active task;
- canonical `AGENTS.md` as a normalized reference and hash;
- applicable assigned role records and their permission ceilings;
- any exact project-local, source-locked specialist catalog referenced by an
  applicable assignment;
- explicit `.agent-governance/packs.lock.json` and
  `.agent-governance/source-lock.json` files, including valid empty sets, so
  deleting a lock cannot silently remove restrictions or provenance.

Conditional inputs are:

- exact-pinned Pack artifacts when their lock entry is active;
- active human-confirmed decisions as provenance when present.

It does not infer permissions from free-text `AGENTS.md`, decision rationale,
an ADR, or a task description. A policy-relevant choice must be represented in
a validated structured input.

It never reads `.agent-governance/local/`.

Incomplete governed input returns `needs-input`. No partial candidate policy is
written.

## Merge Rules

Governed provenance is considered in this order:

```text
user-confirmed governance
→ assessed risk profile
→ canonical AGENTS reference
→ active human-confirmed decisions
→ role permission ceiling
→ active optional Packs
→ target defaults
```

Every permission is combined by the most-restrictive mode:

```text
deny
→ require-approval
→ constrained-allow
→ allow
→ advisory
```

Source order never lets an `allow` override a deny or wider scope override a
narrower scope. Role capabilities are intersected with the project ceiling.
Packs may narrow policy or add checks; they cannot grant authority.

An attempted widening blocks with `POLICY_PRIVILEGE_EXPANSION`.

For every external specialist selected by an assignment, compile reloads the
source-locked catalog and exact-matches the role ID, responsibility, relevant
task surface, requested capabilities, revision, license, and source hash.
Catalog metadata is never trusted as an authority grant. A mismatch blocks
with `ROLE_CATALOG_INVALID`; malformed assignment structure is rejected as
`POLICY_MANIFEST_INVALID` before catalog path discovery.

A Pack control scoped to one task keeps that `TASK-*` scope when exactly one
active task is compiled. With multiple active tasks, version 1 blocks a
task-scoped Pack with `POLICY_CONFLICT` instead of flattening it into a
project-wide rule. Pack mechanical and human-review checks become deterministic
`EVD-PACK-*` evidence requirements; listing a check in Pack metadata does not
prove it ran.

## Policy Controls

The neutral manifest contains:

- filesystem;
- shell;
- network;
- credentials;
- destructive actions;
- publish actions;
- external content;
- generated artifacts;
- retention;
- verification.

Each control records its mode, governed sources, reason codes, normalized
scope, target support, and evidence requirement. Unsupported target controls
remain in the manifest, Adapter, receipt, and doctor findings; they are never
silently dropped.

If `generatedArtifacts` resolves to `deny`, dry-run still provides a no-write
preview, but a normal compile is blocked with `POLICY_CONFLICT`. A deny is not
converted into an approval path.

## Codex Adapter Boundary

The Phase 2 Adapter records:

- the canonical policy ID and full hash;
- repository instruction references;
- approval and prohibited-action guidance;
- governed verification guidance; `verificationCommands` remains empty when no
  structured governed input supplies a command;
- mapped and unsupported controls;
- project-trust/runtime compatibility limitations;
- GovernSeed-owned generated files.

It emits JSON only under `.agent-governance/adapters/codex/`.

It does not write:

- `.codex/config.toml`;
- `.codex/rules/`;
- `AGENTS.md`;
- `~/.codex` or another user-global location;
- a Skill, Agent persona, model, Provider, credential, or session setting.

Codex documents project configuration, sandboxing, approvals, and command
rules. GovernSeed does not materialize those surfaces in this phase because
project trust, configuration precedence, user ownership, runtime version, and
effective behavior are not observed by compilation. See the
[Codex capability matrix](research/2026-07-29-codex-policy-capability-matrix.md).

## Deterministic Artifacts

Policy and Adapter JSON use:

- recursively sorted object keys;
- stable arrays;
- portable project-relative paths using `/`;
- UTF-8 and LF;
- exactly one final newline;
- SHA-256 content hashes.

The IDs are content-addressed:

```text
POL-<first 12 uppercase hex of canonical policy seed digest>
COMPILE-<first 12 uppercase hex of transaction identity digest>
```

The policy seed excludes the self-referential `policyId`. The full canonical
manifest digest, not the short ID, is used for manifest integrity and the
Adapter `policyHash`.

`generatedAt` is present as `null` in the manifest so the wall clock cannot
change policy bytes. The first successful receipt contains `compiledAt`.
Repeating a completed identical compile reuses matching artifacts and receipt,
reports them under `filesUnchanged`, and makes no write.

## Dry Run

`--dry-run` performs all reads, validation, merge logic, Adapter generation,
Schema checks, owner/path checks, and output planning in memory.

It does not:

- create a directory;
- write a temporary file;
- create, update, rename, or delete an artifact;
- write a receipt.

The returned preview is Schema-valid and identifies proposed creates,
unchanged files, unsupported controls, warnings, and blocking findings.

## File Ownership and Atomicity

Before writing, the compiler rejects:

- absolute or user-home paths;
- traversal outside the real project root;
- symlink or hardlink targets;
- changed parent directory identity;
- invalid UTF-8 or files over 1 MiB;
- secret-like/private values;
- an existing target that does not exact-match GovernSeed-owned content.

Unknown files are never overwritten.

The compiler writes same-directory temporary files, flushes them, rechecks
parents, and promotes content-addressed outputs. It writes the receipt last.
If a step fails, it removes only newly created files whose owner and hash
exact-match the transaction plan. A crash that leaves policy/Adapter output
without the matching receipt is partial output and does not count as complete.
Before writing the receipt, it revalidates the final policy and Adapter bytes,
hashes, ownership, and parent identities. An unexpected replacement is
preserved and blocks completion.

The shared artifact writer rechecks every parent component after its final
link or rename. On a detected swap it removes only the exact newly linked
identity, or restores the exact pre-replacement bytes, and fails closed.

## Exit Codes

| Code | Meaning |
|---:|---|
| `0` | Successful compile or dry-run |
| `1` | Required governed input is incomplete |
| `2` | Usage error |
| `3` | Schema or semantic validation failure |
| `4` | Fail-closed safety, authority, ownership, conflict, or policy block |
| `5` | Bounded project-local I/O failure |

## Doctor Findings

Policy and Adapter validation use these stable codes:

```text
POLICY_INPUT_MISSING
POLICY_MANIFEST_INVALID
POLICY_CONFLICT
POLICY_PRIVILEGE_EXPANSION
POLICY_UNSUPPORTED_CONTROL
POLICY_APPROVAL_MISSING
POLICY_OUTPUT_STALE
POLICY_OUTPUT_DRIFT
POLICY_SOURCE_HASH_MISMATCH
CODEX_ADAPTER_INVALID
CODEX_ADAPTER_OWNER_CONFLICT
CODEX_CONTROL_NOT_ENFORCEABLE
COMPILE_RECEIPT_INVALID
COMPILE_PARTIAL_OUTPUT
COMPILE_PATH_BLOCKED
```

In normal doctor mode, a valid unsupported or representable-only control can
be a warning. Strict doctor fails for privilege expansion, stale/hash mismatch,
owner conflict, active missing approval, partial output, or path/privacy
violations.

Legacy projects without compiler artifacts do not acquire a new required
warning.

## Approval Is External to Compilation

A `require-approval` control records a gate. It is not an approval. The
compiler never manufactures an approver, actor identity, signature, or
confirmation.

Phase 2 has no approval-evidence import or verification contract. An active
publish or delete action that requires approval therefore remains a strict
doctor failure in this phase. Generating the policy, Adapter, or receipt does
not clear that gate.

## Security and Privacy

Normal compile:

- uses Node.js 20 standard-library APIs;
- performs no network call;
- spawns no Agent, model, or Provider process;
- reads no credential or user-global Codex state;
- writes only the three project-local GovernSeed artifact classes;
- stores no raw prompt, raw model output, Provider session, environment dump,
  private log, credential value, home path, or secret-bearing URL.

URL query and fragment keys are normalized before scanning. Common OAuth and
credential-bearing families such as `client_secret`, `refresh_token`, and
`auth_token` are blocked without reflecting their values.

Diagnostics use stable codes and bounded subjects rather than reflecting
blocked content.

## Compile Is Not Enforcement

These statements are established:

- GovernSeed validated governed inputs.
- The core computed a deterministic most-restrictive policy.
- The Codex Adapter truthfully reported candidate mappings and limitations.
- A completed receipt binds the local output bytes.

These statements are not established:

- Codex loaded the Adapter.
- A sandbox or approval policy was active.
- Network or credential isolation occurred at runtime.
- An Agent complied with instructions.
- A human approved an action.
- Effective Policy Attestation passed.

Effective Policy Attestation is Phase 3. It will separately distinguish
`declared`, `materialized`, `observed`, and `runtime-evidenced`; even
`observed` must not be described as runtime enforcement.

## Troubleshooting

### `POLICY_INPUT_MISSING`

Run `agent-governance assess` for active tasks and resolve structured open
questions. Do not place an answer only in prose and expect the compiler to
infer it.

### `POLICY_PRIVILEGE_EXPANSION`

Inspect the referenced role or Pack. It requested a wider mode or scope than
the assessed project ceiling. Narrow the request or complete a separately
reviewed risk-policy revision; do not weaken the compiler check.

### `CODEX_ADAPTER_OWNER_CONFLICT`

The target path exists with unknown or different content. GovernSeed does not
overwrite it. Preserve the file and resolve ownership explicitly.

### `POLICY_OUTPUT_STALE` or `POLICY_SOURCE_HASH_MISMATCH`

A governed input changed after compilation. Revalidate the source and compile
a new content-addressed policy. Do not edit generated hashes by hand.

### `COMPILE_PARTIAL_OUTPUT`

The receipt-last transaction did not complete. Preserve unknown files. A
subsequent compile may complete the transaction by writing its missing receipt
only when the expected policy and Adapter already exact-match the planned,
GovernSeed-owned bytes. It does not delete orphan output; otherwise resolve the
conflict manually.

### `CODEX_CONTROL_NOT_ENFORCEABLE`

The candidate is honest about a control that the Phase 2 Adapter cannot enforce
or observe. Apply the required human/runtime control outside compilation and
retain the warning as evidence of the limitation.
