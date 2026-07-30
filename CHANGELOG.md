# GovernSeed Changelog

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
  carries 94 entries and 857,171 unpacked bytes, down from 282 entries and
  2,374,948 bytes, and no longer ships `tests/`, `experimental/`, `docs/`, or
  `examples/`. The package name and all three bin names are unchanged.
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
