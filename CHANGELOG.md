# GovernSeed Changelog

## 2026-07-31 — Source Freshness: Claims With An Expiry Date

- Every capability-matrix classification rests on what an official page said on
  a fixed date, and the upstream tools ship weekly. Nothing detected the
  load-bearing sentence disappearing — the last and largest instance of the
  claims-more-than-it-verifies defect family this release has been closing.
- `docs/research/source-freshness.lock.json` pins, for each of the 17 official
  pages the three matrices cite, the exact sentence its classifications rest
  on. All 17 were verified verbatim against the live pages at seed time.
- The offline half runs in `test:governance`: matrix citations and the lock
  must cover each other bidirectionally, and every lock entry's `matrices`
  list must actually cite it. A citation added without a pin — or a pin
  orphaned by an edit — fails `npm run ci` with no network involved.
- The online half is `npm run verify:sources` (`--strict`, `--json`): each
  pinned page is re-fetched and reported `FRESH`, `DRIFTED`, `UNREACHABLE`, or
  `UNVERIFIABLE`. Strict mode fails on drift and coverage gaps, never on
  unreachability — a network blip is not evidence of drift. A weekly
  `source-freshness` workflow runs it.
- `DRIFTED` demands human re-verification of the citing rows; the tool never
  edits the matrices. The lockfile and both scripts stay out of the npm
  package — the release unit is unchanged.

## 2026-07-31 — Milestone 4 Records What It Delivered

- `docs/superpowers/plans/2026-07-31-milestone-4-runtime-materialization-parity-plan.md`
  still read `Status: Plan for review. Nothing in this document is implemented.`
  while Scopes A, B, and C had shipped and merged — the Claude target
  materializer, the target registry, target-parameterized attestation, and
  three contract test files. An indexed document was stating the opposite of
  the repository.
- The status is corrected, and a delivery record maps every acceptance item to
  the test that proves it, so the claim is checkable rather than asserted. All
  nineteen cited test names were verified to resolve against the 474 tests in
  the suite. Two Scope B behaviors that went beyond the written acceptance list
  are recorded rather than left invisible: the symlink refusal, and the network
  control being deferred with a reason instead of approximated as a
  `Bash(curl *)` deny.
- Scope D is closed rather than pending. Its entry condition — an Antigravity
  capability matrix with official sources — was met, and the matrix's finding
  closes the scope: no row is materializable, because the only documented file
  carrying restriction keys is user-global and the one project-local candidate
  is BLOCKED on four counts. Reopening requires new official documentation, not
  a new plan.

## 2026-07-31 — The Documentation Map Is Checked Against The Directory It Maps

- A sweep for dead files across all 333 tracked files found none. Every script
  is wired into `package.json` or another script, no build artifact is tracked,
  the root is fifteen conventional files, and every document is either required
  by `scripts/validate-starter.mjs`, referenced by a test, or a deliberate
  historical record. Nothing was deleted, because nothing was dead.
- What the sweep did find is that `docs/index.md` had drifted to omitting eight
  documents — including `adr/001-linux-codex-oci-containment.md` and both name
  audits, which `scripts/validate-starter.mjs` lists as *required* repository
  artifacts. The map claimed to cover the documentation and covered
  three-quarters of it.
- `npm run validate` now compares `docs/index.md` against every `docs/**/*.md`,
  so a document added without an index row fails instead of becoming invisible.
  All eight are now listed.

## 2026-07-31 — Three Example Fixtures, And The Registration They Exposed

- A filled example inherits a conditional template's transferable rules — real
  mode is synthetic-only, persist only scanned evidence, fail closed — and
  restates them in its own terms. It does not inherit disclosures about
  GovernSeed's own evaluator: a support-triage agent has no Codex containment
  status, so copying one puts a false statement into a document whose whole
  purpose is to model an honest one.
- `production-agent-triage/AI_SECURITY_REVIEW.md` had copied five such lines
  verbatim. They are replaced with boundaries the project can actually hold:
  what a green golden set does and does not claim, what the injection review
  covered, and why a drop in stored traces means the scanner failed closed.
- Both `AGENT_RUNTIME.md` examples also borrowed `runtime proof` and `the
  evaluator's separate evidence gate`, terms that name starter machinery an
  adopting project does not have. Both now name their own smoke run and their
  own golden set.
- `npm run fixtures` now fails when a fixture contains a starter-only
  disclosure. Red before the rewrite: five hits, all in one file.

- The roadmap's three remaining example gaps are filled:
  `ui-dashboard-redesign` (UI_SPEC, DESIGN_SYSTEM, DESIGN_REVIEW),
  `production-agent-triage` (AGENT_RUNTIME, AI_SECURITY_REVIEW, EVAL_PLAN,
  ENV_CHECKLIST, RESEARCH_SYNTHESIS), and `launch-one-pager`
  (PRESENTATION_BRIEF with a claim-to-source map). Each passes strict doctor
  with zero warnings and carries a generated `expected/doctor.json`.
- Extending the section-parity test from every fixture to every conditional
  template found that `macos-beta-handoff/MACOS_RELEASE_CHECKLIST.md` was a flat
  bullet list: all eight template sections were gone, including the entitlements
  and TCC tables and the pre-release checklist. It had been passing because
  nothing compared it back to its template. It now carries the full structure.
- The examples README claimed to list every fixture and did not — `antigravity-base`
  was never added. `npm run fixtures` now compares that table against the
  registered fixture list, so an unlisted fixture fails instead of drifting.
- Three headings the fullstack example legitimately translates are declared in
  the parity test rather than treated as drops.

## 2026-07-31 — The Antigravity Matrix Exists, And It Keeps Scope D Blocked

- `docs/research/2026-07-31-antigravity-policy-capability-matrix.md` satisfies
  the entry condition the Claude matrix records for the Antigravity phase: an
  equivalent matrix with official sources and its own BLOCKED list. Every row
  cites a page under `https://antigravity.google/docs/`.
- The finding is that **no row is materializable**, so Scope D produces no code
  and no claim. Antigravity documents a restriction surface comparable to Codex
  and Claude Code — the grammar is `action(target)` with `Deny > Ask > Allow`,
  over `read_file`, `write_file`, `command`, `read_url`, `execute_url`,
  `unsandboxed`, and `mcp`. What differs is the layer: the only documented file
  carrying those keys is `~/.gemini/antigravity-cli/settings.json`, which is
  user-global, and the materialization boundary forbids writing it.
- The one project-local restriction point is a `hooks.json` `PreToolUse` handler
  returning `decision: "deny"`. It is blocked on four counts: its workspace path
  appears only after `e.g.`, its precedence against the user-global file is
  unstated, whether it loads without a user trust decision is unstated, and the
  handler is an executed shell command rather than declarative configuration —
  a larger commitment than a capability matrix can authorize.
- `.agents/rules` is project-local and documented, but as guidance with no
  documented ability to deny an action, so it is classified
  `representable-only` and stays governance markdown rather than becoming a
  policy target.
- Seven BLOCKED items are recorded, including that GovernSeed already writes
  `.agents/AGENTS.md` and `.agents/skills/`, so whether it may also own a policy
  artifact in that directory is unresolved.
- The document is not added to `package.json` `files`: nothing shipped
  references it, and the release unit carries evidence only for what it ships.

## 2026-07-31 — Inherited Policy Sections Are Checked, Not Only Offered

- A conditional template carries two kinds of section: prompts the adopting
  project fills in, and fixed policy it inherits verbatim — retention rules,
  fail-closed conditions, and what the evidence may be claimed to establish.
  Only the fillable ones were checked.
- So `examples/template-adoption/fullstack-ai-saas` had dropped `EVAL_PLAN.md`'s
  `Evidence / Claim Boundary` and `AGENT_RUNTIME.md`'s `Evidence Persistence`
  and `Stateless Reducer`, and the doctor still reported the project fully
  filled and ready to proceed. Presence of the document passed for coverage of
  its policy.
- The doctor now checks both policy sections as fields, and a section-parity
  test compares each filled example back to the template it was filled from, so
  a future drop fails rather than reads as complete. The parity test declares
  the two bilingual headings the examples legitimately translate; every other
  heading must match.
- The example now carries all three sections, written for its own project
  rather than copied.

## 2026-07-31 — 0.1.1 Replaces A 0.1.0 Published From The Wrong Tree

- 0.1.0 was published from a working checkout instead of the verified release
  commit. That checkout predates the release unit: it carries no `files`
  whitelist, so npm packed 395 files (2.9 MB unpacked) including a 195-file
  `.bat-worktrees/` copy of the repository, plus the `tests/`, `examples/`, and
  `.github/` trees that `tests/governance/package-surface.test.mjs` excludes.
  It declares two bins, so `compile`, `materialize`, and `attest` were
  unreachable from an install. The verified tree packs 135 files, 1.3 MB, and
  three bins. Contents were scanned for credentials; none were present.
- 0.1.1 ships that verified tree. 0.1.0 is unpublished. The first public
  version number is therefore 0.1.1.
- `prepublishOnly` now runs `npm run ci`, which fails when the working tree
  does not match committed HEAD. Run against the checkout 0.1.0 came from, that
  gate reports `Required repository artifact does not match committed HEAD` and
  refuses to publish. The defect was that nothing connected the checks to the
  publish; nothing else about the checks changed.
- Wiring the gate exposed that `npm publish --dry-run` exports
  `npm_config_dry_run`, which `smoke:package`'s own `npm pack` and `npm install`
  inherited, so a rehearsed publish packed nothing and the smoke failed on a
  missing tarball. The smoke now clears that variable for its children, making
  `npm publish --dry-run` a rehearsal that actually runs the install.

## 2026-07-31 — The Quick Start Covers The Installed Package, Not Only A Clone

- The quick start taught `git clone` only, and `init`'s final next step named
  `node governseed/scripts/doctor.mjs`, a path that exists only in a clone.
  Anyone installing the package was told to run something they do not have.
- Both now give the installed form as well, running `agent-governance-init` and
  `agent-governance-doctor` through `npx --package`, with a global install noted
  as the way to put all three bins on `PATH`. Verified against a packed tarball,
  both through `npx` and through a prefixed global install.
- The README also states what a clone gives that the package does not: the
  example projects, the full test suites, and the capability-matrix research.
- Naming the package in install commands adds three occurrences of the legacy
  identifier to the README, so its brand row moves from `compatibility text` to
  `compatibility text; legacy machine identifier` with a count of four. The
  check added earlier today caught the stale count on the first run.

## 2026-07-31 — The Core Boundary Plan Records Where Its Packaging Rule Was Superseded

- `docs/superpowers/plans/2026-07-30-core-boundary-consolidation-plan.md` A2
  accepted "出貨內容不含 `tests/`、`experimental/`、`docs/`、`examples/`" while
  the package has shipped named `docs/` and `tests/` paths since that same plan
  was implemented. The document was marked implemented with every checkbox left
  blank, so nothing recorded which acceptance items held.
- The supersession happened inside PR #13, not afterwards. `9b38c55` implemented
  the twelve-entry whitelist literally; `0d3ac5c` in the same PR found it
  "dropped paths that tests/brand/brand-compatibility.test.mjs requires the
  published package to carry" and whitelisted them "explicitly instead of the
  whole docs and tests trees". PR #13 merged with nineteen `files` entries
  covering the twenty-one published paths the brand test pinned at the time.
- The acceptance line is annotated `SUPERSEDED` rather than rewritten or
  checked, and a completion record states both A2 line outcomes: line 136
  `SUPERSEDED`, line 137 `PASS` — verified by `smoke:package` in PR #28.
- The current contract is stated once and owned by
  `tests/governance/package-surface.test.mjs`: `experimental/`, `examples/`, and
  `.github/` are excluded outright; `docs/` and `tests/` ship only the release
  dependencies and evidence files named in `package.json` `files`.

## 2026-07-31 — The Brand Transition Table Is Checked Against The Repository

- `docs/migrations/governseed-brand-transition.md` states that every retained
  legacy-name occurrence is classified in its table and that
  `tests/brand/brand-compatibility.test.mjs` enforces the counts. Only the
  test's own count literal was enforced. A path could be registered there and
  never classified, leaving the document asserting a completeness it no longer
  had — which is exactly what had happened to three paths.
- The table and the repository now check each other in both directions: a
  retained occurrence with no classification row fails, a row whose count no
  longer matches fails, and a row that matches nothing fails. The last one
  catches a classification left behind by a deleted file.
- Three rows were added:
  `docs/superpowers/plans/2026-07-30-core-boundary-consolidation-plan.md`,
  `examples/template-adoption/antigravity-base/.agent-governance.json`, and
  `tests/policy-compiler/base-project/.agent-governance.json`.
- The brand traversal is unchanged; the new check reuses it.

## 2026-07-31 — The Packaged Artifact Is Verified To Run, Not Just To Contain

- `package.json` `files` ships `tests/policy-compiler/fixture-contracts.test.mjs`
  so a consumer can re-run the portable contract against their own install, and
  the brand test asserts that path is in the tarball. Nothing asserted the
  tarball works. `files` lists paths, so a shipped module that imports an
  unshipped one packs cleanly and only fails at the consumer's first import.
- Three of the shipped test's dependencies were missing from `files`. Installing
  the tarball and running the test failed on `ERR_MODULE_NOT_FOUND` for
  `./helpers.mjs`, then on `ENOENT` for the base project fixture. All eight
  fixture cases now pass from a clean install.
- `tests/policy-compiler/helpers.mjs` and the pack fixture
  `tests/decision-role/fixtures/low-risk-docs-task/` are now shipped. The base
  project it copies could not be: `examples/` is kept out of the release unit,
  and adding it also pulled `examples/template-adoption/README.md` past the
  whitelist. The test owns `tests/policy-compiler/base-project/` instead, pinned
  byte-for-byte to the example by a new `package-surface` assertion — two copies
  are only meaningful while they are the same project.
- `.agent-governance.json` in that copy carries the legacy generator token like
  every generated project, so it is registered in the brand inventory. The brand
  traversal is unchanged.
- `npm run smoke:package` packs the tarball, installs it into a clean consumer
  project, and then checks three things against the installed copy: every
  relative import reachable from the declared `bin` entrypoints and the shipped
  tests resolves inside the package, every shipped test passes, and all three
  bins run — `agent-governance --help`, plus an `init` and `doctor` round trip.
- The import walk is what generalizes. Executing an entrypoint only covers the
  modules that entrypoint happens to reach, so a lib missing from `files` on an
  unexercised path would still ship broken.
- This is not a publish. The package remains unpublished and the package-name
  decision is unchanged.

## 2026-07-31 — The Antigravity Runtime Adapter Has A Fixture And A Smoke

- Codex and the all-runtime path had `smoke:base` and `smoke:fullstack`.
  Antigravity had neither a filled fixture nor a generator smoke, so the
  `.agents/` files `init --agent antigravity` writes had no checked-in
  counterpart and could drift without any check failing. Closes #6.
- `examples/template-adoption/antigravity-base/` is a filled project whose
  `.agents/` tree is byte-for-byte what the generator produces, with a
  checked-in `expected/doctor.json` at `status: ready`.
- `npm run smoke:antigravity` runs `init --agent antigravity`, compares the
  generated `.agents/` file list and every file's bytes against the fixture,
  asserts `--agent codex` produces no `.agents/` at all, and then runs doctor on
  the generated project. A fixture that is not what the generator emits is not
  evidence, so the comparison is byte-exact rather than structural.
- Three tests pin the runtime contract the adapter is read through: the fixture
  ships `.agents/AGENTS.md` and at least two skills, every `SKILL.md` opens with
  a terminated frontmatter block whose `name` equals its directory, and the
  adapter names `../AGENTS.md` instead of restating a gate lifecycle row.
  Frontmatter is parsed, not grepped: a `name:` line in the body would otherwise
  pass a file that has no frontmatter at all.

## 2026-07-31 — Doctor Checks Conditional Documents Field By Field

- `doctor` checked that `AGENT_RUNTIME.md`, `EVAL_PLAN.md`, and
  `AI_SECURITY_REVIEW.md` existed and were not verbatim templates. A document
  that kept its headings and emptied their contents passed. Closes #4.
- Nine governed fields are now checked for coverage, not mention: tool
  permission, side effect, and rollback plus human approval in `AGENT_RUNTIME.md`;
  golden set, regression method, and monitoring boundary in `EVAL_PLAN.md`;
  prompt injection, tool side effect, tenant and PII risk, tenant isolation, and
  kill switch in `AI_SECURITY_REVIEW.md`.
- Two codes, so a missing section reads differently from an empty one:
  `CONDITIONAL_FIELD_MISSING` and `CONDITIONAL_FIELD_UNFILLED`. Both are
  ordinary warnings, so `--strict` blocks on them.
- Table columns match every accepted spelling. The templates label these tables
  in Chinese and the filled examples label them in English, so matching one
  vocabulary would pass whichever document used the other.
- The filled `fullstack-ai-saas` fixture already covers all nine fields, so its
  expected doctor JSON is unchanged. Two fixture mutations prove the checks are
  load-bearing: emptying one bullet and deleting one section each make strict
  doctor fail.

## 2026-07-31 — Process-Tree Reap Is Polled, Not Decided On One Look

- `terminateProcessTree` sent `SIGKILL`, slept one fixed `killGraceMs`, and
  reported `PROCESS_TREE_UNAVAILABLE` if the group was still present. SIGKILL
  cannot be refused, so a group still present at that moment is waiting to be
  reaped, not resisting — the code reported a scheduling delay with the code
  that means containment could not be proven. Fixes #24.
- The reap is now polled to a deadline, so it returns as soon as the group is
  gone and only a group that outlives the deadline fails. A probe refused by the
  environment still fails immediately; retrying it would answer nothing.
- `terminateProcessTree` had no direct unit test — every path ran through real
  processes, so the reap window was only ever exercised at whatever speed the
  machine happened to run. Three tests now drive it through an injected
  `killImpl` and an immediate scheduler, independent of wall-clock timing.
- The fail-closed contract is unchanged: same code, same exit 3.

## 2026-07-31 — Validation Distinguishes A Missing Git From An Uncommitted File

- `npm run validate` reported every required artifact as not committed in HEAD
  when a checkout was present but `git` was not on `PATH` — common in slim CI
  images. `spawnSync` signals a command that never ran through `error`, or
  through a null status when a signal killed it, and both were being read as a
  non-zero exit, which is a verdict about the file. Fixes #18.
- Both conditions now fail closed once, naming the environment rather than the
  files. Validation still exits non-zero: a checkout with no usable `git`
  produces no signal about commit state, and GovernSeed does not pass a check it
  could not run.
- No change where `git` works, and none where `.git` is absent, which still
  skips the check as before.

## 2026-07-31 — Published Claim Surface Covers Both Targets

- `docs/enforcement-boundary.md` and `README.md` described `materialize` as
  writing one file, `.codex/config.toml`. Both shipped that claim in the npm
  package after the Claude target landed, so the published boundary was
  narrower than the tool. Both now state what each target writes, the two
  ownership models, the Claude precedence and fail-open hazards, and which
  controls are not target-materialized per target with the reason.
- A new governance test derives the covered targets from the target registry,
  so a future target that ships without a published claim fails CI rather than
  being caught by reading.
- No behavior change. Documentation and one test only.

## 2026-07-31 — Claude Code Target Materialization and Attestation

- `materialize` and `attest` now accept `--target claude`. The target owns
  `.claude/settings.json` and nothing else: not `.claude/settings.local.json`,
  not `~/.claude`, not any managed settings path. A negative test asserts each.
- **Ownership is entry-level for this target, not whole-file.** Claude Code
  documents `.claude/settings.json` as checked into git and shared with the
  team, so it usually exists and carries entries GovernSeed did not write.
  `permissions.deny` and `permissions.ask` use required-entry semantics — a
  missing required entry is drift, an extra entry is reported as an additional
  restriction and is never removed. That holds as a property of the runtime
  rather than as a relaxation: permission rules merge across scopes rather than
  override, and `deny` is evaluated first with specificity ignored, so an extra
  entry can only restrict further.
- The two mode locks use no-overwrite semantics. A different existing value is
  `TARGET_SETTINGS_SCALAR_CONFLICT`, which names both values and writes nothing.
  GovernSeed does not decide which of a human's two values is stricter.
- Ownership lives in the receipt as `ownedEntries` and `ownedScalars`. No marker
  key is written into the file: a project referencing the official settings
  schema would show the user a validation warning on a key GovernSeed invented.
- A pre-existing file that does not parse is `TARGET_SETTINGS_UNPARSEABLE` and
  is never overwritten. Claude Code rejects an invalid project settings file as
  a whole, so overwriting one would drop the entire project layer including the
  team's own `deny` entries. That is fail-open, and it is refused.
- `permissions.allow` and `permissions.additionalDirectories` are never written;
  they grant. `permissions.defaultMode` is never written either: no compiled
  control expresses a session default, so emitting one would be a restriction
  the policy never declared.
- Network egress is reported as `deferred` with a reason code, not approximated.
  The frozen Claude Code capability matrix records no verified project-layer
  egress key and refuses a `Bash(curl *)` deny as non-equivalent.
- `attest --target claude` separates drift from observation. Drift is the
  project-layer file no longer matching the receipt. A `.claude/settings.local.json`
  that merely exists is an observation; one that sets a governed scalar is
  drift. Observations are reported as findings and never change the exit code.
- The attestation ceiling is unchanged: `materialized-unverified`,
  `trustStateObserved: unknown`, and the hard-coded claim
  `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`. Claude Code's workspace trust
  dialog is interactive and leaves no documented project-local record, so trust
  is no more observable here than for Codex.
- The Codex target's observable behavior is unchanged and proven so: the
  byte-identity guard still pins its emitted config bytes, its receipt hash, and
  its attestation output hash.
- Two shared surfaces were generalized to reach this point. The materialize
  receipt validator derived its allowed target path from a `codex` literal, and
  `target-attest.mjs` imported Codex's caveats and comparison directly. The
  path now comes from the target registry, and each target's attestation profile
  lives in that target's own materializer.

## 2026-07-30 — Target Materialization and Project-Layer Attestation

- Added `agent-governance materialize <project> --target codex [--dry-run]`. It
  writes one project-local file, `.codex/config.toml`, plus a content-addressed
  `MAT-*` receipt. Every emitted value is the strictest value that key admits; a
  policy that would require a looser value is refused with
  `MATERIALIZE_WOULD_WIDEN` rather than written.
- Added `agent-governance attest <project> --target codex`. It is read-only and
  compares three things — the compiled policy, the materialize receipt, and the
  bytes on disk. Its level is capped at `materialized-unverified`;
  `project-layer-observed` stays in the schema as reserved and is unreachable
  while `trustStateObserved` admits only `unknown`. No flag and no environment
  variable raises it. Every output carries the hard-coded claim
  `PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED`.
- **Public claim change.** The README FAQ previously said `compile` "does not
  write Codex runtime configuration". That wording was true until this release
  and is now replaced: `compile` produces a policy candidate and an Adapter,
  `materialize` writes project-local target settings under an explicit command,
  and `attest` reads them back. None of the three establishes runtime
  enforcement. The rewrite lands in the same commit as the implementation.
- `materialize` is a separate command and is never folded into `compile`. The
  existing assertion that `.codex/config.toml` does not exist after `compile`
  is unchanged and still passes.
- Two preflight conditions fail closed before any write, and `attest` re-checks
  both: `TARGET_SETTINGS_PROFILE_MODEL_CONFLICT` when a permission profile
  appears anywhere in the project tree, because profiles and the sandbox
  settings written here do not compose; and `TARGET_SETTINGS_SHADOWED` when a
  nearer `.codex/config.toml` would make the written file inert.
- Recorded a documented hazard rather than hiding it: because Codex uses the
  sandbox settings instead of `default_permissions` when `sandbox_mode` appears
  in any loaded config file, a file whose every value is strictest can still
  displace a stricter permission profile in a layer GovernSeed must not read.
  This appears in every attestation's `precedenceCaveat`.
- A `deny` on delete or publish maps to `approval_policy = "untrusted"`, which
  prompts rather than denies. Those controls carry
  `modeCoverage: "approval-gate-only"` so an approval gate never reads as full
  coverage. `modeCoverage` is a receipt field, not a sixth support
  classification; the five frozen classifications are unchanged and no control
  was upgraded to `enforceable`.
- Split the colliding vocabulary. `adapter-materialized` means the Codex Adapter
  JSON exists and its hash matches; `target-materialized` means the native
  project-local setting was written. `tests/governance/vocabulary-consistency.test.mjs`
  fails on the bare term in published prose.
- Added `tests/governance/package-surface.test.mjs`. It asserts that the tarball
  ships nothing outside the resolved `files` whitelist, which is stricter than
  naming directories: it caught npm publishing a parent `README.md` for a
  whitelist entry nested below it. `experimental/`, `examples/` and `.github/`
  stay covered because they are not whitelisted.
- Added `docs/enforcement-boundary.md` and
  `docs/adr/005-target-materialization-and-attestation-boundary.md`; added
  `schemas/materialize-receipt.schema.json` and
  `schemas/attest-output.schema.json`.

## 2026-07-30 — Core Boundary Consolidation

- Moved OCI runtime containment, the credential proxy, the loopback relay, the
  opt-in Docker harness, and the live paired evaluator subcommands `run` and
  `preflight` into `experimental/governance-impact/`, which is outside the Core
  release unit.
- Established a one-way dependency: the experimental entry imports the Core
  paired-scenario engine, and Core imports nothing under `experimental/`.
  `tests/governance/core-release-boundary.test.mjs` fails if a Core module
  imports that surface.
- Core `scripts/governance-impact-eval.mjs` keeps the offline controls, the
  engine, and the `validate`, `replay`, `aggregate`, and `gate` subcommands. It
  now answers `run` and `preflight` with an exit 2
  `EXPERIMENTAL_ENTRY_REQUIRED` usage error naming the experimental entry, and
  does not delegate to it.
- Removed the experimental surface from `npm run ci` and from the Core
  release-unit validation; added `npm run ci:experimental` and a separate
  workflow that is not a required check for Core pull requests.
- Restricted the published package to a `files` whitelist. The tarball now
  carries 108 entries and 1,083,718 unpacked bytes, down from 282 entries and
  2,374,948 bytes. It no longer ships `experimental/`, `examples/`, the test
  suites, or the documentation tree, and it keeps the published governance
  surfaces that `tests/brand/brand-compatibility.test.mjs` pins: the brand
  transition notice, the name-audit report and its evidence, the policy-compiler
  reference and capability matrix, and the policy-compiler fixture contracts.
  The package name and all three bin names are unchanged.
- Process-tree teardown now classifies its pre-teardown probe: a refused
  process-group signal (`EPERM`, `ENOSYS`, `ENOTSUP`) is reported as a missing
  environment capability instead of a cleanup failure. Production keeps the same
  fail-closed contract — `PROCESS_TREE_UNAVAILABLE` at exit 3 — while the tests
  that reap a real child skip with the reported errno instead of failing bare in
  a restricted container or rootless sandbox. No test was removed.
- Recorded override: this consolidation deliberately changes the CLI dispatch
  layer for `run` and `preflight` — their entry location, Core's usage refusal,
  and the approval-gated workflows' spawn target. The OCI and credential logic
  itself moved unchanged.

## 2026-07-29 — Risk-to-Policy Compiler for Codex

- Added a dependency-free, deterministic compiler from assessed risk,
  canonical project rules, role permission ceilings, confirmed decision
  provenance, and source-locked active Packs to a neutral policy manifest.
- Added a thin project-local Codex JSON Adapter that preserves unsupported and
  representable-only controls without writing `.codex`, user-global settings,
  credentials, or a second policy owner.
- Added receipt-last local transactions, content-addressed IDs, canonical
  hashes, dry-run, no-overwrite ownership checks, stable doctor findings, and
  eight executable fixture contracts.
- Preserved Pack checks as deterministic evidence obligations, retained
  single-task Pack scope, blocked ambiguous multi-task Pack scope, and
  revalidated final outputs immediately before receipt commit.
- Revalidated proposed/active decision records and source-locked external role
  catalog provenance, responsibility, task-surface, and capability metadata;
  normalized OAuth secret-bearing URL keys; and closed final link/rename
  parent-swap rollback gaps.
- Compilation does not execute Codex or another model, establish human
  approval, attest effective settings, or prove runtime enforcement.
- Phase 2 does not import approval evidence, so active publish or delete work
  that requires approval remains a strict doctor failure.

## 2026-07-29 — GovernSeed Brand Transition

- Adopted GovernSeed as the public display brand and Eskasia GovernSeed as the
  formal brand.
- Preserved the existing `agent-governance-starter` package, commands, schemas,
  generated-project metadata, configuration paths, and machine identifiers for
  compatibility.
- Recorded the separately approved repository rename to
  `https://github.com/Eskasia/governseed`; no npm package or CLI alias changed.

## 2026-07-29 — Decision And Role Foundation

- Added seven closed, versioned governance artifact schemas plus a separate
  closed CLI-output contract, deterministic canonical hashes, exact JSON
  limits, pinned source provenance, privacy scanning, and fail-closed path and
  symlink handling.
- Added the dependency-free `agent-governance` umbrella CLI for explicit risk
  assessment, four-seat decision-plan export/result import, separate
  hash-bound human confirmation, deterministic role assignment, and Pack
  listing. The CLI does not execute an Agent or model, access credentials,
  write user-global settings, or use the network.
- Extended doctor with stable risk, decision, deliberation, role, source,
  privacy, and path finding codes while retaining legacy-project
  compatibility.
- Added the five-item built-in governance responsibility catalog and six
  positive/negative fixture families for low-risk documentation, architecture
  decisions, restricted publishing, malicious catalogs, replay mismatch, and
  privacy.
- Recorded the modular-core/external-Adapter boundary, exact source adoption
  SHAs and licenses, and, at that milestone, implementation plans for a later
  Policy Compiler, Effective Policy Attestation, source-specific optional Pack,
  and external Adapter milestones. Those capabilities were not yet implemented
  in Milestone 1, and no runtime-enforcement claim was made.

## 2026-07-29 — Conditional Research Synthesis

- Added an advisory, user-confirmed `RESEARCH_SYNTHESIS.md` workflow for material evidence conflict, high-impact decisions, multiple credible routes, and explicit multi-perspective research requests.
- Added five evidence-bound analytical lenses, a contradiction map, layered output, claim-level confidence calibration, external gap-fill limits, and a transparent academic-rigor self-review.
- Added a fail-closed strict doctor warning when a pre-copied research template lacks one explicit confirmed or declined user decision; file presence alone does not activate research.
- Kept the capability outside runtime execution, multi-agent orchestration, hard gates, release evidence, and governance-effectiveness claims.

## 2026-07-26 — Linux Codex OCI Scheme A

### Credential-Free Review Gate

- Added a separate manual Linux preflight command, closed receipt schema, and `workflow_dispatch` workflow with no GitHub Environment or credential. The receipt records exact image/runtime provenance, model, timeout, policy hashes, hardening observations, cleanup proof, and `executionBoundaryId` as `READY + NOT_EVALUATED`.
- Schema-v2 real runs require a human-reviewed, committed, tracked-clean receipt, manifest, policy, and synthetic scenario. The evaluator repeats preflight and matches receipt, provenance, manifest model/boundary, timeout, and the fresh observed boundary before lazily reading the provider credential.
- The receipt is not attestation, credential authorization, paired-run evidence, or a claim. Human review and commit remain manual and are not chained into the approval-gated real workflow.

### Containment, Relay, And Provider Boundary

- Added the Linux/Codex-only OCI supervisor with non-root/read-only/capability-dropped containment, private PID/cgroup namespaces, resource limits, PID-1 lifeline, cgroup-v2 empty-boundary proof, identical boundary identity across both arms, and cleanup-before-persistence ordering.
- Kept Docker networking at `none`. A narrowly scoped host `sudo -n nsenter` relay enters only the container network namespace, rejects an invoking UID 0 or GID 0, then drops back to the approved non-root host UID/GID before listening on container loopback and connecting to the host-only credential-proxy UDS; the UDS is not bind-mounted into the container. One bounded stdin line carries closed relay configuration and subsequent EOF is the lifeline, so relay secrets do not depend on argv, preserved `sudo` environment, or `sudoers env_keep`.
- Kept the upstream key host-only and passed only an attempt-scoped bearer to the container. Proxy policy locks exact attempt/model/deadline, `store: false`, foreground progressive SSE, no provider-held response/conversation/prompt or nested item/file/container references, no remote input URLs, stripped client identifiers, and client-executed tools; `tool_search` must explicitly use client execution.
- Bounded the no-server-state client tool loop to 32 sequential requests, one active request, 1 MiB per request, 4 MiB per response, and one attempt deadline. Progressive SSE preserves backpressure and fails closed on quota, relay, transport, provider, or cleanup uncertainty.
- Public push/pull-request CI remains offline and credential-free. The separate real workflow is manual, Linux-only, Environment-approval-gated, success-only for artifact upload, and cleanup-finalized.
- Pinned repository text checkouts to LF so byte-bound scenario digests, workflow parsing, and runtime-proof frontmatter remain deterministic across Windows, macOS, and Linux.
- Windows CI still runs the portable policy, process, named-pipe relay, privacy, and fail-closed contracts. It explicitly skips native Unix-socket cleanup, POSIX owner/mode, and Linux OCI execution tests; Ubuntu and macOS retain those offline test surfaces, while real Scheme A eligibility remains Linux-only.

### Evidence Status

- Criterion 4 remains `BLOCKED`: code, schemas, unit/privacy tests, injected integration tests, workflows, ADRs, plans, and a `READY` receipt do not substitute for live evidence on the final reviewed commit from the actual Linux/cgroup-v2 host, `sudo -n`/`nsenter` command and stdin-lifeline boundary, real netns-to-host-UDS path, digest-pinned Codex image, provider request/SSE path, teardown cases, cleanup, and real paired run.
- No live provider compatibility, Zero Data Retention, release readiness, or governance-effectiveness claim is made.

## 2026-07-26 — Governance Evidence Overhaul

### Intent And Rule Evidence

- Added privacy-safe `SRC -> REQ -> AC -> TASK -> EVD` lineage validation, append-only requirement replacement/withdrawal, route-evidence checks, stable doctor codes, and unsafe-input negative tests.
- Kept `GATE-INTENT-001` and `GATE-ROUTE-001` under the existing canonical lifecycle owner; runtime adapters continue to reference rather than redefine them.

### Paired Evaluator And Runtime Proof

- Added closed governance-impact schemas, deterministic scoring/aggregation/gating, three synthetic paired scenarios, a fail-closed CLI, adapter contracts, and privacy/process/persistence regression tests.
- Public CI runs deterministic offline controls and mock runtime proof only. It never enables governance-impact real mode or runtime-proof real mode.
- Codex, Claude, and Antigravity governance-impact real execution remains fail-closed until each runtime's containment and non-persistence contract is proven.
- Runtime-proof publication preserves prior canonical evidence across failed and identical reruns, uses no-replace publication, and removes only artifacts owned by the current attempt.
- Release validation now requires every evaluator, scenario, privacy-test, workflow, and audit artifact to exist in and match `HEAD`; index-only, staged, or unstaged drift fails closed. Windows direct resolution accepts only native `.exe` or `.com` executables under `shell: false`.
- The standalone runtime-proof validator now requires the exact forced-mock public workflow entrypoint and its wrapper script instead of accepting an environment-sensitive substring match.
- Clarified that runtime proof checks only generated entrypoint responses and that no bundled offline evidence supports a governance-effectiveness claim.

## 2026-07-13 — Canonical Gate Lifecycle

### Rule Lifecycle Records

| Gate ID | Change | Canonical owner | Status | Evidence | Event-only review trigger | Fallback | Superseded by |
|---|---|---|---|---|---|---|---|
| GATE-INTENT-001 | add | `templates/runtime/AGENTS.md` | active | Approved intent-lineage design and lifecycle negative tests | Intent evidence, acceptance, or trace validation changes | Block implementation and open a governed loop | n/a |
| GATE-ROUTE-001 | add | `templates/runtime/AGENTS.md` | active | Approved route-decision design and lifecycle negative tests | Immutable constraints, deployment, acceptance, scale, or route validation changes | Mark route recheck-required and block implementation | n/a |

Future gate additions, changes, suspensions, and retirements must append the same fields. Retirement removes the canonical definition and keeps a `retired` or `superseded-by` tombstone here.

## 2026-06-01 — Major Restructure

### Directory Reorganization
- Moved startup files (00–02) into `startup/`.
- Moved conditional workflow files (03–15) into `workflows/` with semantic names.
- Moved `13-context-pressure-workflow.md` to `docs/experiments/context-mode.md`.
- Deleted `BOOTSTRAP.md` (was a 3-line redirect) and `INDEX.md` (merged into README).
- Created `docs/adr/` with ADR template.

### New Files
- `LICENSE` (MIT).
- `CONTRIBUTING.md` — how to add workflows, templates, and fixtures.
- `AGENTS.md` — bootstrap and maintenance instructions for Codex users.
- `CLAUDE.md` — bootstrap instructions for Claude Code users.
- `scripts/init.mjs` — copies templates to a new project directory.
- `scripts/doctor.mjs` — checks if a project satisfies bootstrap gate conditions.
- `examples/template-adoption/README.md` — explains fixture scenarios.

### Template Quality
- Expanded `templates/DATA_MODEL.md` from 4 lines to full schema with entities, relations, RLS, migration, seed data.
- Expanded `templates/API_CONTRACT.md` from 4 lines to full spec with routes, error shape, webhooks, pagination, permission matrix.
- Expanded `templates/TASK_CONTRACT.md` with task overview table, dependency graph, and acceptance checklist.

### De-personalization
- Renamed `07-starred-repo-addons.md` → `workflows/recommended-tools.md`.
- Removed `$` Codex-specific prefixes from skill names in `workflows/tool-routing.md`; added "需安裝" column.
- Removed hardcoded `/Users/william/...` paths from README.
- Consolidated tool reference sections to reduce overlap with `recommended-tools.md`.

### Cross-reference Updates
- Updated all internal references to use new `startup/`, `workflows/`, `docs/` paths.
- Eliminated triple-definition of file structure routing in 02/05/09; 02 and 05 now point to `workflows/agent-file-structure.md`.
- Rewrote `scripts/validate-starter.mjs` for new directory structure.

---

## 2026-06-01 — Initial Baseline

- Renumbered workflow docs from `09-agent-file-structure.md` through `15-design-system-from-screenshots.md` to remove the old duplicate `08-*` prefix.
- Added GitHub Actions validation workflow and `.gitignore`.
- Added two template-adoption examples under `examples/template-adoption/`.
- Added `VALIDATION.md` to record local validation, CI entrypoint, and template-adoption fixtures.
- Updated `scripts/validate-starter.mjs` to require CI workflow, unique prefixes, and at least two example fixtures.
- Added `BOOTSTRAP.md` compatibility redirect and updated active references to `01-bootstrap-gates.md`.
- Added fixed-document templates for `PROJECT_BRIEF.md`, `SPEC.md`, `CONTEXT.md`, `OPEN_LOOPS.md`, `AGENTS.md`, and `TECH_STACK.md`.
- Added high-risk conditional templates for `PRESENTATION_BRIEF.md`, `RAG_DESIGN.md`, `EVAL_PLAN.md`, and `AI_SECURITY_REVIEW.md`.
- Added `INDEX.md` as the canonical read order.
- Added `scripts/validate-starter.mjs` for local starter consistency checks.
