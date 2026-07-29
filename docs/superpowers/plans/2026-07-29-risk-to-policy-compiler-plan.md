# Risk-to-Policy Compiler Implementation Plan

**Date:** 2026-07-29

**Status:** Implementation complete; local and hosted verification pending

**Branch:** `feature/risk-to-policy-compiler`

**Base:** `main@95a278bd974c84832a4b3a8c9af9566f569256d4`

## Goal Contract

Deliver one dependency-free vertical path:

```text
assessed risk + governed provenance + role ceilings + active Packs
→ canonical neutral policy
→ Codex project-local JSON Adapter
→ receipt-last transaction
→ doctor evidence
```

Completion requires all local canonical checks, eight compiler fixtures,
targeted safety/determinism tests, three independent review axes, package
evidence, and Ubuntu/macOS/Windows hosted CI. It excludes Attestation, other
targets, Codex execution, credentials, user-global writes, merge, release, and
publish.

Every production behavior follows red-green-refactor. A focused test must
demonstrably fail for missing behavior before the owning implementation is
added. Tests are not weakened to make a result pass.

## Task 1: Freeze the Design and Codex Capability Boundary

**Owner:** Architecture/documentation

**Files:**

- `docs/adr/004-risk-to-policy-compiler.md`
- `docs/superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md`
- `docs/research/2026-07-29-codex-policy-capability-matrix.md`
- `docs/policy-compiler.md`

**Work:**

- Record the neutral core/target Adapter ownership split.
- Map current official Codex surfaces without inventing configuration fields.
- Record why Phase 2 emits JSON only and does not write `.codex` or
  `AGENTS.md`.
- Freeze `POL-<12 uppercase hex>` from a canonical non-self-referential policy
  seed, `COMPILE-<12 uppercase hex>`, canonical JSON, `generatedAt: null`,
  receipt-only wall clock, and receipt-last completion.
- Document compile versus enforcement and Phase 3 deferral.

**Acceptance:**

- [ ] Each target capability is classified as `enforceable`,
  `representable-only`, `unsupported`, `requires-human-approval`, or
  `runtime-evidence-required`.
- [ ] Official claims link to current Codex documentation.
- [ ] No target-specific decision logic moves into the core.
- [ ] No Codex-native runtime file is promised.

**Verification:**

```text
git diff --check
```

## Task 2: Write Failing Schema and Canonicalization Tests

**Owner:** Policy core/tests

**RED files:**

- `tests/policy-compiler/schema-contracts.test.mjs`
- `tests/policy-compiler/core.test.mjs`

**RED cases:**

- all required fields and closed Draft 2020-12 contracts;
- unknown versions/statuses, duplicate IDs, malformed IDs and hashes;
- raw prompts, home paths, credentials, environment/session/private fields;
- deterministic key/array/path/LF normalization;
- `generatedAt: null` and no wall clock in policy identity;
- source precedence and most-restrictive meet;
- role ceiling intersection and Pack narrowing;
- deny/approval/scope widening blocked;
- unsupported controls preserved.

Run the focused tests and retain the expected failure caused by the absent
Schemas/core.

**GREEN files:**

- `schemas/policy-manifest.schema.json`
- `schemas/codex-policy-adapter.schema.json`
- `schemas/compile-receipt.schema.json`
- additive references in `schemas/cli-output.schema.json`
- `scripts/lib/policy-compiler-core.mjs`
- minimal reusable additions to `scripts/lib/governance-artifacts.mjs`

**Acceptance:**

- [ ] Exactly three new artifact Schemas are added.
- [ ] Schema version `1` is closed and unknown versions fail.
- [ ] Full hashes, short IDs, source references, and control modes agree.
- [ ] Free-text AGENTS/decision content is never parsed into authority.
- [ ] Missing governed input returns `needs-input`; no candidate manifest exists.
- [ ] Identical canonical inputs yield byte-identical manifest/Adapter plans.

**Verification:**

```text
node --test tests/policy-compiler/schema-contracts.test.mjs
node --test tests/policy-compiler/core.test.mjs
```

**Dependency:** Task 1.

## Task 3: Implement the Codex Adapter from Failing Contract Tests

**Owner:** Codex Adapter/tests

**RED files:**

- `tests/policy-compiler/cli-contracts.test.mjs`

**RED cases:**

- repository instruction reference and policy hash mapping;
- approval, prohibited-action, and verification guidance;
- unsupported/non-enforceable control retention;
- no full policy duplication;
- no `.codex/config.toml`, `.codex/rules/`, AGENTS rewrite, persona, global path,
  credential, model, or Provider setting;
- stable mapped-control ordering and compatibility facts.

Run the focused test and observe failure for the missing Adapter.

**GREEN files:**

- `scripts/lib/codex-policy-adapter.mjs`
- `schemas/codex-policy-adapter.schema.json` only for defects exposed by the
  approved contract tests, never to relax a required boundary

**Acceptance:**

- [ ] The Adapter is a pure translation of an already resolved policy.
- [ ] It emits JSON only below `.agent-governance/adapters/codex/`.
- [ ] Project trust, precedence, and runtime dependence are explicit.
- [ ] `mapped` never means `enforced`.
- [ ] Unsupported controls cannot disappear.

**Verification:**

```text
node --test tests/policy-compiler/cli-contracts.test.mjs
```

**Dependency:** Task 2.

## Task 4: Implement Safe Compile CLI and Receipt-Last Transaction

**Owner:** CLI/artifact transaction

**RED files:**

- `tests/policy-compiler/cli-contracts.test.mjs`
- `tests/policy-compiler/artifact-safety.test.mjs`

**RED cases:**

- `compile <project> --target codex [--dry-run] [--json]`;
- complete in-memory dry-run with zero filesystem mutation;
- JSON stdout is exactly one Schema-valid object and diagnostics use stderr;
- stable exit codes `0` through `5`;
- safe bounded reads and 1 MiB rejection;
- traversal, POSIX/macOS/Windows home paths, symlink, hardlink, and parent swap;
- unknown-owner conflict without overwrite;
- same-directory temporary write, sync, parent recheck, no-replace
  publication, and receipt last;
- injected receipt-boundary failure, concurrent owner replacement, and parent
  identity swap;
- cleanup of only new, exact-hash owned output;
- crash leftover remains incomplete; a later compile may complete only
  exact-matching GovernSeed-owned policy and Adapter bytes by writing the
  missing receipt;
- second compile reports unchanged and produces zero diff;
- no `fetch`, child Agent process, `~/.codex` read, or global write.

Run the focused tests and observe the missing-command/transaction failures.

**GREEN files:**

- `scripts/agent-governance.mjs`
- `scripts/lib/policy-compiler-project.mjs`
- minimal reusable safe-write additions to
  `scripts/lib/governance-artifacts.mjs`
- additive CLI output contract references

**Transaction order:**

1. Validate every input and compute all bytes/hashes.
2. Validate output ownership and capture parent identities.
3. Stage and sync same-directory temporary files.
4. Recheck parents and promote manifest.
5. Recheck parents and promote Adapter.
6. Promote and sync receipt last.
7. Return the committed receipt.

No action in steps 1–3 completes a transaction. A failure before step 6
rolls back only verified newly created files. A process crash without a receipt
is `COMPILE_PARTIAL_OUTPUT`.

**Acceptance:**

- [ ] Non-dry-run creates exactly the three documented artifacts.
- [ ] Dry-run creates no directory, temp file, or receipt.
- [ ] Unknown-owned existing files remain byte-identical.
- [ ] Same-path different content is blocked as drift/owner conflict.
- [ ] An unchanged receipt is reused; `compiledAt` is not rewritten.
- [ ] Normal compile is offline and uses no child Agent process.

**Verification:**

```text
node --test tests/policy-compiler/cli-contracts.test.mjs
node --test tests/policy-compiler/artifact-safety.test.mjs
node --check scripts/agent-governance.mjs
```

**Dependencies:** Tasks 2 and 3.

## Task 5: Add Compiler Doctor Findings from Failing Integration Tests

**Owner:** Doctor/tests

**RED files:**

- `tests/policy-compiler/doctor-contracts.test.mjs`

**RED cases:**

- every stable policy/Adapter/receipt finding;
- stale risk/role/Pack/decision/AGENTS hashes;
- malformed, drifted, owner-conflicting, or partial output;
- privilege expansion and unresolved conflicts;
- active publish/delete work, which remains approval-blocked because Phase 2
  has no approval-evidence input;
- representable-only/unsupported warning honesty;
- normal versus strict severity;
- no warning for legacy projects without compiler artifacts.

Run the focused tests and retain expected failures.

**GREEN files:**

- `scripts/lib/policy-compiler-doctor.mjs`
- `scripts/doctor.mjs`
- `schemas/doctor-output.schema.json` only if an additive closed reference is
  required

**Required codes:**

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

**Acceptance:**

- [ ] Strict doctor fails on privilege expansion, stale/hash mismatch, owner
  conflict, active missing approval, partial output, and path/privacy errors.
- [ ] Unsupported or representable-only mappings remain warnings unless a
  separate required gate is missing.
- [ ] Findings never reflect a sensitive value.
- [ ] Existing doctor output and exit behavior remain compatible.

**Verification:**

```text
node --test tests/policy-compiler/doctor-contracts.test.mjs
```

**Dependency:** Task 4.

## Task 6: Build Eight Vertical Fixtures

**Owner:** QA/fixture integration

**Files:**

```text
tests/policy-compiler/fixtures/low-risk-codex/
tests/policy-compiler/fixtures/restricted-data-codex/
tests/policy-compiler/fixtures/publish-approval-codex/
tests/policy-compiler/fixtures/malicious-pack-expansion/
tests/policy-compiler/fixtures/owner-conflict/
tests/policy-compiler/fixtures/stale-policy/
tests/policy-compiler/fixtures/dry-run/
tests/policy-compiler/fixtures/cross-platform-paths/
```

Each fixture is a bounded overlay on an initialized project, not a new
standalone product example. Tests create temporary projects so tracked fixture
inputs are never mutated.

**Acceptance:**

- [ ] `low-risk-codex` compiles and the second run is byte/diff clean.
- [ ] `restricted-data-codex` preserves network/credential deny without an
  enforcement claim.
- [ ] `publish-approval-codex` emits approval guidance and strict doctor fails
  because Phase 2 does not import or verify approval evidence.
- [ ] `malicious-pack-expansion` blocks with
  `POLICY_PRIVILEGE_EXPANSION`.
- [ ] `owner-conflict` preserves unknown bytes and fails closed.
- [ ] `stale-policy` detects changed governed input.
- [ ] `dry-run` leaves the full filesystem snapshot unchanged.
- [ ] cross-platform path variants produce identical canonical bytes.

**Verification:**

```text
node --test tests/policy-compiler/*.test.mjs
npm run fixtures
```

**Dependencies:** Tasks 2–5.

## Task 7: Public Documentation and Package Boundary

**Owner:** Documentation/release hygiene

**Files:**

- `README.md`
- `docs/index.md`
- `VALIDATION.md`
- `CHANGELOG.md`
- `SECURITY.md`
- `docs/policy-compiler.md`
- `package.json`
- CLI help text

**Work:**

- Document command, files, exit codes, repeat behavior, doctor findings, and
  troubleshooting.
- State `compile ≠ enforce`, Adapter JSON is not a sandbox, unsupported
  controls are retained, and Attestation is Phase 3.
- Preserve package and CLI legacy identifiers.
- Include new Schemas, scripts, tests/fixtures as appropriate; exclude
  temporary/private/local artifacts.

**Acceptance:**

- [ ] Public docs make no runtime, provider, adoption, or enforcement claim.
- [ ] No credential or user-global workflow is documented.
- [ ] `npm pack --dry-run --json` includes required implementation/contracts
  and excludes fixtures/private/temporary state according to existing package
  policy.

**Verification:**

```text
npm pack --dry-run --json
git diff --check
```

**Dependency:** Tasks 4–6.

## Checkpoint: Targeted Compiler Verification

```text
node --test tests/policy-compiler/*.test.mjs
node --test tests/decision-role/*.test.mjs
node --check scripts/agent-governance.mjs
node --check scripts/doctor.mjs
git diff --check
```

All targeted tests must pass after the final production edit before broad CI.

## Task 8: Compatibility and Full Local Validation

**Owner:** Root integrator

Run from a clean feature HEAD:

```text
npm run check
npm run validate
npm run ci
npm run fixtures
node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
node --test tests/policy-compiler/*.test.mjs
npm pack --dry-run --json
git diff --check
```

Run every compiler fixture through its documented normal/strict assertion.
Capture command, exit status, test count, and package contents without pasting
secrets or large logs.

**Acceptance:**

- [ ] Legacy init and doctor pass.
- [ ] Existing profiles and adoption fixtures pass.
- [ ] Milestone 1 decision/role behavior passes.
- [ ] Existing runtime-proof and governance-impact paths do not drift.
- [ ] Package evidence matches intended include/exclude boundaries.
- [ ] Final diff contains no unrelated refactor or dirty-worktree content.

## Task 9: Independent Three-Axis Review

Use independent reviewers after implementation and broad local validation.

### Architecture review

- core owns all restriction decisions;
- Adapter only translates;
- no runtime behavior, second policy owner, or speculative target abstraction;
- Attestation remains absent.

### Security review

- no permission expansion;
- bounded paths, symlink/hardlink/parent-swap defenses;
- receipt-last crash safety and owner conflict;
- secret/private/global boundary;
- unsupported-control honesty.

### QA review

- deterministic and second-run behavior;
- dry-run non-mutation;
- cross-platform normalization;
- backward compatibility;
- package boundary and failure-path coverage.

Each reviewer returns findings with file/line evidence, severity, validation
performed, and a clear PASS/FAIL. The root integrator resolves actionable
findings and reruns affected/full checks.

## Task 10: Commit, PR, and Hosted CI

After final validation and review:

1. `feat(policy): add canonical risk-to-policy compiler`
2. `feat(codex): add project-local policy adapter`
3. `test(policy): cover compiler safety and determinism`
4. `docs(policy): document compiler boundaries`

Push `feature/risk-to-policy-compiler` and open:

```text
Title: feat: add Risk-to-Policy Compiler for Codex
Base: main
```

The PR description states:

- Phase 2 scope only;
- compile does not mean runtime enforcement;
- Codex project-local JSON only;
- unsupported controls retained;
- no user-global writes;
- no model or Provider execution;
- Attestation, OCI, and credential proxy excluded;
- package and CLI legacy identifiers unchanged.

Wait for Ubuntu, macOS, and Windows hosted CI to pass. Do not merge, release,
publish, or begin Phase 3.

## Final Evidence Ledger

The completion report records:

- baseline main/base/branch/HEAD and preserved dirty worktree;
- architecture and capability decisions;
- Schemas and CLI behavior;
- exact generated files and unsupported controls;
- stable findings;
- test/fixture counts and commands;
- local validation and hosted CI status;
- package evidence;
- PR URL;
- remaining Phase 3 work and every claim not established.

A code presence, dry-run, compile receipt, or green local test is never
reported as runtime enforcement, Effective Policy Attestation, release, or
publication.
