# ADR-005: Target Materialization and Project-Layer Attestation Boundary

## Status

Proposed on 2026-07-30. Revised three times the same day. Decisions 7 and 8 and
the permission-profile alternative answer the first design review's three
conditions; decision 9 and the selection-rule correction in decision 7 answer the
second. The third revision follows a self-review against the repository, which
found nine defects in the design documents, three of them implementation-blocking;
decisions 3, 4, and 5 carry its corrections. Implementation has not started.

This ADR is the reopen record required by ADR-004 "Reopen Conditions" before
GovernSeed emits a Codex-native runtime setting or makes any materialized or
observed claim.

It supersedes exactly one thing in ADR-004: the Phase 2 deferral of writing
`.codex/config.toml`. It does not change, weaken, or reinterpret any
classification in `docs/research/2026-07-29-codex-policy-capability-matrix.md`,
and it adds no sixth classification.

## Context

ADR-004 rejected writing `.codex/config.toml` in Phase 2 for three stated
reasons: project config "loads only for trusted projects", it "participates in a
larger precedence model", and writing it "would also introduce ownership/merge
semantics and an enforcement claim that this milestone cannot verify".

The capability matrix already records the next step for File write scope:
"Materialize a reviewed native setting, resolve trust/precedence, then observe
the effective setting or runtime evidence." Milestone 3 executes the first half
of that sentence and explicitly declines the second half.

Two vocabulary problems block honest progress reporting:

1. `materialized` means "GovernSeed Adapter JSON exists and its hash matches" in
   the Phase 3 four-level naming recorded in `docs/policy-compiler.md`, but means
   "the target's native setting was written" in the capability matrix. A reader
   of only the first source concludes materialization is already done.
2. `docs/policy-compiler.md` promises a level named `observed`. Reading a
   project-layer file is not observing an effective configuration, because the
   project layer is one of five precedence layers and loads only for trusted
   projects.

## Decision

### 1. `materialize` is a separate command, and `compile` still writes nothing native

`compile` keeps its existing output set and keeps not writing
`.codex/config.toml`. The existing assertion in
`tests/policy-compiler/cli-contracts.test.mjs` that `.codex/config.toml` does not
exist after `compile` stays byte-for-byte unchanged and keeps passing. Writing a
target namespace is a different privilege level and requires a separate explicit
command.

### 2. Classification is untouched; materializability is an orthogonal field

The five matrix classifications keep their definitions and their per-control
values. `enforceable` continues to mean "GovernSeed can mechanically enforce the
specifically named compiler-local property"; producing a native file creates an
artifact, not a guarantee, so nothing is promoted.

A new orthogonal field records materializability:

```text
not-applicable    no native project-layer surface for this control
materializable    a documented native project-layer key exists and is written
deferred          a native surface exists but this milestone does not write it
```

That field lives only in `materialize` and `attest` output. It is not added to
the policy manifest or the Codex Adapter, because both are content-addressed and
a new field would change `policyId`, `policyHash`, and the pinned fixture
identity `POL-7C0E73297E0E`.

### 3. Materialization is restriction-only

Every value `materialize` emits is the most restrictive value that key admits. It
never emits `sandbox_mode = "danger-full-access"`, never emits `approval_policy =
"never"`, never emits `sandbox_workspace_write.network_access = true`, and never
adds a writable root outside the project root. A policy that would require
anything looser produces a fail-closed error instead of a permissive file.

The invariant is stated against each key's value space rather than against its
documented default. An earlier draft used the default as the baseline, which was
weaker and rested on default values the design never recorded; the strictest-value
form needs no such baseline and holds whatever the defaults are.

One emitted value carries less than the control demands: a `deny` control on
`delete`, `publish`, or `shell.execution` materializes as `approval_policy =
"untrusted"`, which prompts rather than denies. That is disclosed per control in
the receipt through a required `modeCoverage` field rather than absorbed into
`materializable`, because a consumer reading `materializable` on a `deny` control
would otherwise conclude the denial was written into the target.

This invariant also keeps GovernSeed compatible with an organization-managed
requirements layer, which restricts permissive values rather than restrictive
ones.

### 4. Whole-file ownership, never a merge

The target file is owned entirely by GovernSeed or not at all. There is no
key-level merge into a user-authored TOML, and no partial edit. An existing file
that is neither the exact planned bytes nor bytes recorded by a prior GovernSeed
materialize receipt is an owner conflict: exit 4, and the existing file is left
byte-identical.

Ownership recognition therefore trusts `.agent-governance/receipts/`, which holds
content-addressed but unsigned files. An actor able to write there can cause an
overwrite. That is stated as this design's trust boundary rather than defended
against: the evidence root is already the root of every claim GovernSeed makes.

### 5. The claim ceiling is the project layer, and trust is unobserved

`attest` may report at most `project-layer-observed`. The output level is a
closed schema enum containing only `project-layer-observed` and
`materialized-unverified`; `observed`, `effective-observed`, and
`runtime-evidenced` are unrepresentable rather than blacklisted.

No official Codex documentation was found that exposes the project's trust state
to a project-local reader, so `trustStateObserved` is `unknown` in this
milestone. Both the receipt schema and the `attest` output schema admit only
`unknown`, so the precondition for the higher level is unrepresentable rather than
merely unreached; narrowing only the receipt, as an earlier draft did, would have
left the claim-carrying artifact guarded by code alone. `unknown` forces the level
down to `materialized-unverified`, with no flag, environment variable, or
configuration path that can override the downgrade. The consequence is stated plainly: in Milestone 3 the reachable level
is always `materialized-unverified`, and `project-layer-observed` is defined but
not yet attainable.

`claim` is the fixed string `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.
`precedenceCaveat` and `knownLimitations` are required non-empty arrays; an empty
array fails schema validation.

### 6. Vocabulary

Two distinct terms replace the ambiguous one:

- `adapter-materialized` — the GovernSeed Adapter JSON exists and its hash
  matches the manifest.
- `target-materialized` — the target's native project-layer settings were written
  by `materialize`.

The Phase 3 four-level naming `declared / materialized / observed /
runtime-evidenced` recorded in `docs/policy-compiler.md` is superseded by
`declared / adapter-materialized / target-materialized / project-layer-observed`.
Historical plan and spec documents are not rewritten; this ADR is the supersession
record.

### 7. The written surface is a legacy one, and the two models must not be mixed

Codex documents two permission models. Current documentation prefers permission
profiles with `allowed_permission_profiles` and managed `default_permissions` for
Codex 0.138.0 and later, and recommends `allowed_sandbox_modes` only for legacy
deployments. It also states that "Permission profiles do not compose with the
older sandbox settings. Configure either `default_permissions` and
`[permissions]`, or `sandbox_mode` / `sandbox_workspace_write`, but not both."

This milestone writes the older `sandbox_mode` and `[sandbox_workspace_write]`
surface. That follows from frozen scope, from the profile model being labelled
Beta, and from the two surfaces being mutually exclusive, so adopting profiles
would be a change of target surface rather than an addition. It is recorded here
explicitly so no reader infers a claim that the written surface is the target's
preferred or long-term one; the documentation says the opposite.

This ADR does not claim that permission profiles are unavailable in a
project-scoped `.codex/config.toml`. No Codex page documents project-layer
availability positively for *any* key; availability is an inference by exclusion
from the closed ignore list, and that same inference is what licenses the four keys
this milestone writes. Using it as a licence in one place and a blocker in another
would be inconsistent, so the deferral rests on scope.

Which model applies is not undefined behaviour. It is a documented selection rule:
if `sandbox_mode` appears in any loaded config file, Codex uses the older sandbox
settings instead of `default_permissions`. That makes the conflict worse rather
than benign, and it has two consequences.

First, `materialize` preflights the project-tree configuration Codex would load and
fails closed with `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` when it finds
`default_permissions` or a `[permissions` table.

Second, and undetectably: if a stricter permission profile lives in the user layer
or a managed layer, the `sandbox_mode` this ADR authorizes will displace it, and the
effective configuration gets wider even though every emitted value is at least as
restrictive as that key's own default. Decision 3's restriction-only invariant is
per-key — the strictest value each key admits — and it does not guarantee that the
effective configuration after materialization is no wider than before. GovernSeed is
forbidden from reading those layers, so this is a required precedence caveat and a
required known limitation on every materializable control, not a check.

### 8. One canonical classification owner per artifact

The compiled Adapter artifact is canonical for `classificationBreakdown` in
`attest` output, because attestation compares artifacts that exist and must not
report a value absent from the JSON it just read. The frozen capability matrix
remains canonical for the design mapping table and the enforcement-boundary
narrative.

Neither source is edited. The gap is carried in a required
`classificationSourceDivergence[]` output field, which may be empty but is never
omitted, so a divergence surfaces instead of being absorbed.

`project-layer-observed` ships as schema-reserved: present in the enum so a future
trust-observation design needs no breaking change, labelled as such everywhere it
appears, and held unproducible — by the narrowed `trustStateObserved` enum in
decision 5, not by test alone.

### 9. The target path is protected, so `materialize` is a user-run operation

`.codex` is recursively read-only under Codex's default `workspace-write` policy,
the same protection applied to `.git`. No documented mechanism lifts it.

`materialize` is therefore a command a person runs, and no GovernSeed document,
help text, or output string may describe it as something an agent bootstraps for
itself from inside a standard Codex session. The design does not attempt to defeat
the protection: no `--force`, no escalation request, no fallback path outside
`.codex`. A sandbox refusal is reported as `MATERIALIZE_TARGET_PATH_PROTECTED` at
exit 4 — a governed-boundary refusal with a specific remedy — rather than as a
generic bounded-I/O failure that would invite a retry that always fails.

Whether creating a `.codex` directory that does not yet exist is permitted is not
documented, so neither outcome is assumed: the normal path runs if the write
succeeds, and the named refusal fires if it does not.

## How ADR-004's Three Rejection Reasons Are Handled

| ADR-004 reason | Handling in this ADR |
|---|---|
| "loads only for trusted projects" | `trustStateObserved` is a required output field. No official surface exposes trust to a project-local reader, so its value is `unknown`, which forces the level down to `materialized-unverified`. Trusted is never assumed. |
| "participates in a larger precedence model" | The claim ceiling is the project layer. `attest` never reports an effective configuration. `precedenceCaveat` must enumerate the layers that can override the project layer, including a nearer project file and an organization-managed requirements layer. |
| "ownership/merge semantics" | Whole-file ownership with no merge, byte-exact ownership recognition, owner conflict at exit 4 with the existing file unchanged, content-addressed receipt written last. |

Two further ADR-004 rejections remain in force unchanged: no user-global Codex
configuration is written, and compilation is not combined with attestation.
`.codex/rules/` and `AGENTS.md` also remain unwritten.

## Consequences

- GovernSeed produces a real Codex-native project-layer artifact for the first
  time, and therefore accepts ownership and drift responsibility for one fixed
  path per project.
- The public README claim changes in the same commit as the implementation, not
  before, because the current wording stays true until `materialize` exists.
- The honest reachable attestation level in this milestone is
  `materialized-unverified`. Reporting anything stronger requires a separately
  reviewed trust-observation design.
- Node.js has no standard-library TOML support and the package has no runtime
  dependencies, so a small deterministic emitter for a closed key set is
  required. `attest` compares canonical bytes and hashes rather than parsing
  arbitrary TOML.
- The capability matrix remains accurate as written, because its statements are
  scoped to the Phase 2 Adapter, which still emits no native configuration.
- GovernSeed writes the surface the target documents as legacy, so this milestone
  acquires a standing obligation to re-check the permission-profile model rather
  than a stable position.
- A project that configures permission profiles cannot be materialized at all.
  That is a deliberate refusal, not a gap: the alternative is emitting a
  configuration the target documents as invalid.
- `materialize` can widen the effective configuration in exactly one way GovernSeed
  cannot detect: by displacing a stricter permission profile held in the user layer
  or a managed layer. This is disclosed in every receipt and attestation rather than
  guarded, because guarding it would require reading a layer ADR-004 forbids.
- `materialize` is not runnable from inside a standard Codex `workspace-write`
  session, because the path it writes is protected. GovernSeed acquires a user-run
  command whose success depends on the caller's context, and a named exit-4 outcome
  for the refusal.
- A project whose tree contains a `.codex/config.toml` deeper than the one
  GovernSeed would write cannot be materialized until that file moves. Writing a
  file the target's closest-file-wins rule renders inert, and issuing a receipt for
  it, is the failure this refusal prevents.
- The target file's identity is derived from the compiled policy rather than from
  the emitted bytes, deliberately diverging from how `compileId` is derived, because
  this artifact embeds its own identifier and the compile artifacts do not.

## Alternatives Considered

### Fold materialization into `compile`

Rejected. It would collapse two privilege levels into one command and would force
a change to the existing assertion that `compile` leaves `.codex/config.toml`
absent. That assertion is regression protection, not an obstacle.

### Add a sixth classification such as `materializable-enforceable`

Rejected. The matrix's five classifications describe what GovernSeed can
truthfully say; writing a file changes the artifact inventory, not the truth
conditions. An orthogonal field records the new fact without disturbing a frozen
vocabulary.

### Merge GovernSeed keys into an existing user `.codex/config.toml`

Rejected. Merging requires a TOML parser, comment and ordering preservation, and
a per-key ownership model. Every one of those is a new failure surface, and a
partial merge cannot be verified by a byte comparison. Whole-file ownership with
a fail-closed conflict is smaller and honest.

### Report `observed` after reading the project-layer file

Rejected. A nearer project file, the command line, and an organization-managed
requirements layer can all change what finally applies, and the project layer
does not load at all for an untrusted project. Reading one layer is not observing
an effective value.

### Let an operator assert trust with a flag

Rejected. A self-asserted trust flag would manufacture the exact evidence the
level is supposed to prove, and it would make the strongest claim the easiest one
to produce.

### Write `.codex/rules/` for shell execution

Rejected, keeping ADR-004's position. The official documentation states "Rules
are experimental and may change", and rules govern commands outside the sandbox
rather than the whole neutral policy.

### Adopt permission profiles as the written surface

Rejected for this milestone, and this is the closest call in the ADR. Permission
profiles are the model the documentation prefers for Codex 0.138.0 and later, and
they can express read scope, which the sandbox surface cannot. Against that: they
are labelled "Beta. Permission profiles are under active development and may
change", and adopting them would change the target selection that this milestone's
decision 3 froze. Their project-layer availability is *not* an argument against
them, per decision 7.

Choosing them would also not remove the non-composition problem, only invert it: a
project that already sets `sandbox_mode` would then be the conflicting case. It
would, though, remove the silent-widening hazard in decision 7, because writing a
profile cannot displace a stricter profile the way writing `sandbox_mode` can. That
is the strongest argument for reopening this alternative early.

This is the first reopen condition below, not a deferral without a trigger.

## Reopen Conditions

Reopen this ADR before adopting permission profiles as the written surface,
observing or claiming an effective Codex configuration, reporting any level above
`project-layer-observed`, writing a second native target surface such as
`.codex/rules/`, adding a non-Codex materialize target, writing outside the
project root, merging into a file GovernSeed does not own, or emitting any value
that is less restrictive than the target's default.

Reopen it on a target-side trigger too: if permission profiles leave Beta, if the
selection rule between the two permission models changes, if the `.codex`
protected-path behaviour changes, or if a surface for observing resolved project
trust appears. The first two would make the surface choice in decision 7 stale, the
third would change decision 9, and the fourth would unblock BLOCKED-3 and make
`project-layer-observed` reachable.
