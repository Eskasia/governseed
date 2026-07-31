# GovernSeed Changelog

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
