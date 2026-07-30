# Decision and Role Foundation Implementation Plan

**Date:** 2026-07-29
**Status:** Implemented and merged as PR #9 on 2026-07-29
**Worktree:** isolated worktree on `feature/governance-decision-role-foundation`
**Branch:** `feature/governance-decision-role-foundation`
**Base:** `codex/public-promotion-readiness@e458c017468dbf4f9329ea51df4f1f5ad319c6b6`

## Goal Contract

Deliver the seven closed Schemas, dependency-free local umbrella CLI,
deterministic risk/deliberation/role rules, built-in responsibility catalog,
additive doctor findings, six fixture overlays, compatibility tests, and
complete Milestone 1 documentation.

Do not implement the Policy Compiler, Effective Policy Attestation, external
runtime adapters, live model execution, provider automation, OCI changes,
credential workflows, hosted services, a database, a scheduler, or a
marketplace.

No commit, push, merge, release, publish, deployment, credential access, or
user-global write is authorized by this plan.

## Dependency Graph

```text
locked design and source matrix
  → Schema contract tests
    → safe artifact I/O
      → risk assessment
        ├→ deliberation plan/import
        └→ role assignment/Pack list
              → doctor bridge
                → compatibility and package validation
                  → independent security/QA review
```

The earliest failed handoff is fixed before downstream work continues.

## Task 1: Lock Design, Sources, and License Boundary

**Description:** Record the approved architecture, domain model, source
revisions, license treatment, and implementation sequence before production
code.

**Acceptance criteria:**

- [x] Six repositories have default branch, exact SHA, license, read date,
  adopted/rejected behavior, direct-reuse state, and attribution treatment.
- [x] Two ADRs separate modular core/adapters and Deliberation Seats/Delivery
  Roles.
- [x] The design covers product boundary, data model, states, Schemas, CLI,
  privacy, errors, migration, testing, non-goals, future phases, and licenses.

**Files:**

- `docs/research/source-adoption-matrix.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/adr/002-modular-core-and-adapter-boundary.md`
- `docs/adr/003-deliberation-and-role-assignment-model.md`
- `docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md`

**Verification:**

```text
git diff --check
```

**Dependencies:** None.

## Task 2: Define Schema Tests, Then Seven Schemas

**Description:** Establish closed JSON contracts and semantic fixture
expectations before implementing validators.

**RED:**

- Add `tests/decision-role/schema-contracts.test.mjs`.
- Add safe positive/negative fixture overlays for all seven contracts.
- Run the focused test and observe failure because the Schemas/validators do
  not exist.

**GREEN:**

- Add:
  - `schemas/risk-profile.schema.json`
  - `schemas/source-lock.schema.json`
  - `schemas/governance-pack.schema.json`
  - `schemas/role-catalog.schema.json`
  - `schemas/role-assignment.schema.json`
  - `schemas/deliberation-plan.schema.json`
  - `schemas/deliberation-result.schema.json`
- Add `schemas/cli-output.schema.json` as the used transport-envelope contract;
  it is not an additional governance artifact.
- Add only the minimum exported semantic-validator surface needed by the
  tests.
- Add the closed `decision.json` semantic validator in the core rather than an
  eighth Schema file. It validates version, ID/directory match, revision,
  state, sources, options, transition, and canonical content hash.

**Acceptance criteria:**

- [ ] Draft 2020-12, `schemaVersion: 1`, and closed objects are mechanically
  asserted.
- [ ] Unknown version, duplicate ID, missing source revision/license,
  unpinned external source, invalid status, unknown reference, graph mismatch,
  privilege expansion, and missing confirmation record are rejected.
- [ ] External Pack/catalog/role provenance exact-matches one source-lock row;
  self-reported source metadata is insufficient.
- [ ] Decision records are closed, canonically hashed, and fail on revision,
  transition, or directory/record mismatch.
- [ ] Schema regexes compile under Node.js.
- [ ] Every umbrella `--json` response validates as one closed CLI envelope,
  including command-specific result payloads.

**Verification:**

```text
node --test tests/decision-role/schema-contracts.test.mjs
```

**Dependencies:** Task 1.

## Task 3: Build Safe Artifact I/O from Failing Boundary Tests

**Description:** Implement one local file boundary for every new command
without importing experimental evaluator/runtime code.

**RED:**

- Add `tests/decision-role/artifact-safety.test.mjs`.
- Cover invalid UTF-8, BOM/NUL, escaped-equivalent duplicate JSON keys, nesting
  and aggregate-member limits, 1 MiB descriptor-bounded reads, every-component
  symlink rejection, parent identity changes, traversal,
  POSIX/macOS/Windows absolute paths, CRLF/LF, raw prompt field, synthetic
  secret pattern, provider cookie, and secret-bearing query string.
- Observe stable expected failures.

**GREEN files:**

- `scripts/lib/governance-artifacts.mjs`
- focused test fixtures under `tests/decision-role/fixtures/privacy-negative/`

**Acceptance criteria:**

- [ ] Descriptor-bounded fatal UTF-8 and exact JSON parsing with decoded-key,
  depth, and member limits.
- [ ] Real project-root containment, every-component symlink rejection,
  no-follow plus post-open identity checks, and fail-closed platform fallback.
- [ ] Canonical JSON/hash and atomic project-local writes re-check parent
  identity before no-replace rename.
- [ ] Non-reflective stable findings.
- [ ] `.agent-governance/local/` is created only after its ignore rule, uses
  restrictive POSIX modes, is not a symlink, and is never scanned as evidence.
- [ ] The only permitted core read from `local/` is an explicitly named,
  normalized deliberation result; raw/provider-private content is rejected.

**Verification:**

```text
node --test tests/decision-role/artifact-safety.test.mjs
```

**Dependencies:** Task 2.

## Task 4: Implement Risk Assessment and Umbrella CLI Slice

**Description:** Add the smallest end-to-end command: explicit risk input to
deterministic assessed output.

**RED:**

- Add assess cases to `tests/decision-role/cli-contracts.test.mjs`.
- Add `low-risk-docs-task` and incomplete-risk fixture overlays.
- Verify missing inputs produce `needs-input`, a complete docs-only task
  becomes low risk, JSON stdout is one object, diagnostics stay on stderr, and
  a second run produces identical bytes.

**GREEN files:**

- `scripts/agent-governance.mjs`
- `scripts/lib/decision-role-core.mjs`
- `tests/decision-role/fixtures/low-risk-docs-task/`

**Acceptance criteria:**

- [ ] Only explicit structured fields drive risk.
- [ ] High-risk unknowns are never inferred from prose.
- [ ] No network, child process, credential, Plugin, or user-global write.
- [ ] Exit codes match the design.

**Verification:**

```text
node --test tests/decision-role/cli-contracts.test.mjs
```

**Dependencies:** Task 3.

## Task 5: Implement Deliberation Plan and Import Slice

**Description:** Generate the four-round plan and validate portable results
without model execution or automatic approval.

**RED:**

- Add deliberation cases to `tests/decision-role/cli-contracts.test.mjs`.
- Add `architecture-decision` and `replay-version-mismatch` fixture overlays.
- Assert three reasonable architecture options, independent seats/rounds,
  deterministic plan bytes, metadata-only
  redaction, unknown decision/source mismatch, graph mismatch, imported versus
  human-confirmed state, plan/decision content-hash mismatch, rejection of an
  incoming `human-confirmed` result, a separate declared-human-confirmation
  record bound to exact decision/plan/result hashes, and preservation of
  `SPEC.md`/`TECH_STACK.md`.

**GREEN files:**

- `scripts/lib/decision-role-core.mjs`
- `scripts/agent-governance.mjs`
- `tests/decision-role/fixtures/architecture-decision/`
- `tests/decision-role/fixtures/replay-version-mismatch/`

**Acceptance criteria:**

- [ ] Trigger false writes no plan.
- [ ] Trigger true writes the exact four-round graph.
- [ ] Exported plans are immutable; changed decision or plan content creates a
  new revision/hash and cannot replay an old result.
- [ ] Import is fail-closed on decision, plan hash, graph, version, source,
  privacy, or transition mismatch.
- [ ] Import accepts and persists only `imported`; it rejects externally
  supplied `human-confirmed` or confirmation-like data.
- [ ] Only a separate explicit project-local confirmation transition can
  produce `human-confirmed`; the record declares confirmation but does not
  prove human identity.
- [ ] `deliberate confirm` rejects a mismatched decision, plan, or result hash,
  preserves the imported result on failure, and makes strict doctor pass only
  after an exact matching confirmation.
- [ ] The core computes the persisted result hash; an `active` decision without
  an exact-matching confirmation record remains invalid.

**Verification:**

```text
node --test tests/decision-role/cli-contracts.test.mjs
```

**Dependencies:** Task 4.

## Task 6: Implement Responsibility Catalog, Role Assignment, and Pack List

**Description:** Add deterministic minimum-role selection, permission
intersection, append-only human override, and read-only Pack listing.

**RED:**

- Add role and Pack cases to `tests/decision-role/cli-contracts.test.mjs`.
- Add `restricted-publish-task` and `malicious-role-catalog` fixture overlays.
- Assert low/medium/high role rules, four-role cap, reason codes,
  author/approver separation, missing specialist handling, malicious
  capability rejection, exact source-lock provenance, scoped capability
  matching, identical rerun, and append-only override. The malicious catalog
  separately requests unrestricted network, broad credential access, and root
  write; each request is blocked. Targeted cases cover UI/accessibility and
  schema/migration domain-review mapping.

**GREEN files:**

- `catalogs/governance-responsibilities.json`
- `scripts/lib/decision-role-core.mjs`
- `scripts/agent-governance.mjs`
- fixture overlays for restricted publish and malicious catalog

**Acceptance criteria:**

- [ ] Five responsibility definitions contain no persona or authority grant.
- [ ] External catalog absence does not block core governance roles.
- [ ] Effective permission is the most restrictive meet of active project,
  risk, canonical, and Pack constraints; source priority never defeats a deny.
- [ ] Catalog/target metadata is request/support input, not authority, and
  cannot raise the project ceiling.
- [ ] Assignment overrides and Packs can only narrow authority; elevation
  requires a separately reviewed risk-policy revision.
- [ ] `pack list` is local/read-only and does not install or update a Pack.

**Verification:**

```text
node --test tests/decision-role/cli-contracts.test.mjs
```

**Dependencies:** Task 4.

## Checkpoint: Core CLI

```text
node --test tests/decision-role/*.test.mjs
node --check scripts/agent-governance.mjs
```

All new core slices must be green before doctor integration.

## Task 7: Add Doctor Findings Without Breaking Legacy Projects

**Description:** Compose a new doctor evaluator with the existing doctor;
retain existing JSON schema version and warning semantics.

**RED:**

- Add doctor integration cases to
  `tests/decision-role/doctor-contracts.test.mjs`.
- Assert all requested stable finding codes.
- Assert strict failure for high-risk missing assignment, required
  unconfirmed deliberation, privilege expansion, source problems, privacy,
  path, unsafe/missing local ignore coverage, local symlink, and separation
  violations without traversing private local contents.
- Assert normal low-risk fixture pass after assignment and legacy fixtures
  unchanged.

**GREEN files:**

- `scripts/lib/decision-role-doctor.mjs`
- `scripts/doctor.mjs`
- `tests/decision-role/doctor-contracts.test.mjs`
- `schemas/doctor-output.schema.json` only if an additive field is necessary

**Acceptance criteria:**

- [ ] No `.agent-governance/` means no Milestone 1 warning.
- [ ] Fatal new codes fail normal and strict mode without value reflection.
- [ ] Existing warning strings and exit behavior remain compatible.

**Verification:**

```text
node --test tests/decision-role/doctor-contracts.test.mjs
node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
```

**Dependencies:** Tasks 5 and 6.

## Task 8: Wire Package, Validator, Documentation, and Compatibility

**Description:** Make the new surface distributable and documented without
changing runtime adapter behavior.

**RED:**

- Extend validator/package tests so missing new release artifacts or an
  incorrect bin/script fail.
- Assert legacy init double-run skip behavior and runtime adapter output.

**GREEN files:**

- `package.json`
- `scripts/validate-starter.mjs`
- `README.md`
- `VALIDATION.md`
- `CHANGELOG.md`
- `docs/index.md` if the existing index requires new entries

**Acceptance criteria:**

- [ ] Existing bins remain and `agent-governance` is added.
- [ ] `npm run test:decision-role` is included in `npm run ci`.
- [ ] README uses the fixed terminology and conservative claim boundary.
- [ ] Phase 2–5 are plans, not implemented claims.
- [ ] Existing runtime adapter files do not drift.

**Verification:**

```text
npm run check
npm run test:decision-role
npm run smoke:base
npm run smoke:fullstack
npm run fixtures
```

**Dependencies:** Task 7.

## Task 9: Full Verification and Independent Review

**Description:** Run the native release checks, then give the final diff to
independent security and QA reviewers.

**Commands:**

```text
npm run check
npm run validate
npm run ci
npm run fixtures
node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
node --test tests/decision-role/*.test.mjs
npm pack --dry-run --json
git diff --check
```

**Acceptance criteria:**

- [ ] Independent governance/security review finds no unresolved high-severity
  issue.
- [ ] Independent QA reproduces focused, compatibility, package, and diff
  evidence.
- [ ] No test, Schema, severity, or fixture is weakened to hide failure.
- [ ] The final report distinguishes local contract tests from hosted
  cross-platform evidence.
- [ ] If the committed-artifact gate cannot pass without an unauthorized
  commit, every other CI component is run and the exact remaining gate is
  reported `BLOCKED`; the validator is not weakened.

**Dependencies:** Task 8.

## Deferred Implementation Plans (Separate PRs)

These sequences are design commitments only. Milestone 1 does not create their
commands, Schemas, generated settings, or runtime claims.

### Phase 2: Risk-to-Policy Compiler

1. Write failing tests for a closed `policy-manifest.json`, canonical input
   hashes, ordered `POL-*` controls, and unsupported-control findings.
2. Implement a pure neutral-policy compiler over active project governance,
   risk policy, and source-locked Packs using the same permission meet.
3. Define the thin Adapter contract and a reference Adapter that cannot execute
   an Agent, use network, or write user-global settings.
4. Add Codex, Claude, and Antigravity format Adapters with deterministic
   project-local output manifests and explicit supported/approximated/
   unsupported reports.
5. Test double-run bytes, stale owned-output cleanup, source/license changes,
   migration, no-global-write, no-network, and unsupported controls.

Exit gate: a manifest and target files can be reproduced from identical inputs;
no claim exceeds the target's documented capability.

### Phase 3: Effective Policy Attestation

1. Write failing tests for a closed `ATT-*` result bound to policy,
   Adapter/version, expected files, observations, and canonical hashes.
2. Implement the monotonic `declared → materialized → observed` comparison,
   with explicit downgrade findings for missing, stale, unsupported, or
   unnormalizable settings.
3. Define a separate optional runtime-evidence input contract; do not infer it
   from project settings or Adapter files.
4. Test hash mismatch, Adapter upgrades, normalization, stale evidence, level
   downgrade, and wording that distinguishes observation from enforcement.

Exit gate: a general Adapter can claim at most `observed`; only validated real
runtime evidence can produce `runtime-evidenced`.

### Phase 4: Optional Packs and External Adapters

1. Define Pack lifecycle tests for version, source/revision/license/hash,
   mechanical/human checks, carrying cost, retirement, and non-expansion.
2. Implement each Pack independently and disabled by default.
3. Build the Agency Agents metadata Adapter with duplicate normalized-ID,
   capacity, provenance, and stale-output tests.
4. Only if persona output is justified, add an explicit project-local
   `roles persona materialize` command: mandatory dry-run, create/overwrite/
   delete preview, license notice, then explicit apply; no user-global writes.
5. Build only a file/manual Multi-AI Adapter unless the pinned upstream exposes
   a supported stable import API.

Exit gate: each unit is optional, independently versioned, source-locked,
permission-narrowing, removable, and covered by compatibility fixtures.

### Phase 5: Experimental or Separate Project

Keep live multi-model execution, provider browser/session automation, hosted
policy services, schedulers, marketplaces, OCI containment, credential
proxies, and live paired evaluation outside core. Each requires a separate
threat model, dependency/release boundary, credential approval, cleanup proof,
and real runtime evidence. Offline fixtures cannot establish effectiveness.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PR #7 is unmerged | New branch cannot target `origin/main` alone | Record base SHA/dependency; keep M1 diff isolated and do not merge PR #7. |
| Doctor strict mode treats every warning as failure | Legacy fixtures could regress | Activate new checks only for opted-in `.agent-governance/` projects; run all three legacy strict fixtures. |
| JSON Schema cannot express all cross-file rules | False acceptance | Keep pure semantic validators as the authority for decision records, canonical hashes, references, transitions, permission, provenance, and duplicates. |
| New safe I/O duplicates evaluator primitives | Maintenance cost | Keep a narrow neutral module and do not refactor experimental runtime code in this PR. |
| Catalog metadata implies permission | Privilege expansion | Treat role/catalog capabilities as untrusted requests; take the most restrictive policy meet before intersecting target support. |
| Four-AI result looks like approval | Governance bypass | Force import to `imported`; require a separate declared-human-confirmation transition bound to exact decision/plan/result hashes. |
| Symlink or parent race escapes project root | External read/write | Reject every symlink component, use descriptor identity checks, re-check the output parent, and fail closed when the platform cannot establish the guarantee. |
| Dirty feature tree fails HEAD release gate | Incomplete verification claim | Do not weaken the gate; request commit authorization only if needed for final commit-bound evidence. |

## Rollback

Milestone 1 is additive. Rollback removes the umbrella bin, four new core
files, seven Schemas, the responsibility catalog, focused tests/fixtures, and
additive doctor bridge. Existing `init`, doctor lineage, profiles, templates,
runtime proof, governance-impact, and OCI behavior remain independently
revertible.
