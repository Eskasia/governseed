# Governance Evidence Overhaul Delivery Audit

Date: 2026-07-26

Status: BLOCKED

This report records the independent review and local QA evidence for the governance evidence overhaul. The implementation is captured in local commit `7f32cf9`, and the first committed verification report is captured in follow-up commit `281f3c1`; clean detached worktrees at both revisions passed their complete local verification sets. This remains local commit evidence, not pushed branch or cloud CI evidence.

## Review Streams

| Stream | Scope | Result |
|---|---|---|
| Task 5 contract reviewer | Evaluator CLI, runner, schemas, scenarios, and completion contract | PASS; committed scenarios validate from clean commit `7f32cf9` |
| Task 5 security reviewer | Process launch, persistence, privacy, and fail-closed behavior | No unresolved evaluator finding; real Codex evaluation refuses before launch with `SESSION_SAFETY_UNAVAILABLE` |
| Task 6 runtime-proof reviewers | Runtime proof cleanup, publication, concurrency, and negative cases | PASS after regression coverage and independent re-review of prior-artifact preservation |
| Task 7 public-delivery reviewer | README, validation docs, package scripts, public CI, and claim boundaries | PASS after mechanically locking claim separation and mock-only public CI |
| Task 8 QA agent | Focused tests, strict doctors, smoke fixtures, full CI, and worktree mutation check | PASS on clean macOS worktrees at local commits `7f32cf9` and `281f3c1` |
| Task 8 specification auditor | Completion criteria and branch-reproducible evidence | Criterion 4 remains BLOCKED; criterion 5 remains PARTIAL pending the hosted three-platform matrix |
| Task 8 security reviewer | Evaluator and runtime-proof attack paths | PASS; the prior-artifact deletion finding was reproduced, fixed, and closed by direct re-test |
| Final diff reviewer | Complete diff, staged ownership boundary, validator, and release-readiness signals | PASS; the reviewed index tree matched the full-CI candidate tree and excluded every user-owned hunk |
| Cross-platform reviewer | Ubuntu, macOS, and Windows process, path, package, and workflow behavior | Current offline/mock paths passed review; Windows resolution now rejects `.cmd` and `.bat` shims that cannot run under `shell: false` |
| Distribution and CI completion audit | Package tarball, clean consumer install, public workflows, and committed-release boundary | Closed two release-gate gaps: required artifacts must match `HEAD`, and the public CI workflow is now part of the committed release unit |
| Runtime-truth completion audit | Mock/real claim separation and standalone runtime-proof validation | Closed the loose substring check; the standalone validator now requires the exact forced-mock public entrypoint and wrapper |

## Completion Criteria

| Criterion | Status | Evidence |
|---|---|---|
| 1. SRC/REQ/AC/TASK/EVD and append-only changes | PASS | `templates/fixed/PROJECT_BRIEF.md`, `SPEC.md`, `TASK_CONTRACT.md`, `OPEN_LOOPS.md`, `TECH_STACK.md`; `tests/governance/traceability.test.mjs` |
| 2. Stable doctor findings | PASS | `scripts/lib/governance-checks.mjs`; governance doctor and traceability tests |
| 3. Canonical rule ownership and thin adapters | PASS | `templates/runtime/AGENTS.md`, `templates/runtime/START_HERE.md`, `templates/runtime/README.md`; rule-lifecycle tests; mock runtime proof |
| 4. Real evaluator adapters | BLOCKED | Validate, replay, run, aggregate, and gate paths exist, but every shipped real adapter intentionally refuses until containment and session-safety guarantees are proven |
| 5. Controls on all CI operating systems | PARTIAL | Complete local CI passes on macOS at commits `7f32cf9` and `281f3c1`; the committed GitHub Ubuntu/macOS/Windows matrix has not run because no push or PR was authorized |
| 6. Public surfaces agree | PASS | The committed tree aligns public docs, package scripts, CI, schemas, scenarios, privacy tests, runtime adapters, and claim boundaries |
| 7. Final-worktree commands | PASS | Clean detached worktrees at `7f32cf9` and `281f3c1` passed the applicable full CI, scenario CLI, strict doctor, diff, and package checks |
| 8. Independent review and QA | PASS | Three independent staged-tree reviewers plus prior security and QA reviewers returned PASS; user-owned hunks remained outside the commit |

## Local QA Evidence

The independent QA agent reproduced the following on the current macOS worktree:

- `npm run check` and `npm run validate:runtime-proof` exited 0.
- Governance tests passed 80/80.
- Governance-impact tests passed 128/128, including 23/23 scenario-schema tests and 5/5 control fixtures.
- Privacy tests passed 23/23 after the runtime-proof preservation fix; its focused negative suite passed 15/15.
- Two sequential `npm run runtime:proof` runs passed after the fix.
- Forced mock proof passed for Codex, Claude, and Antigravity while real-mode environment variables and invalid runtime paths were supplied.
- All three strict fixture doctors passed.
- Base and fullstack smoke projects passed with their expected warnings.
- `npm run fixtures` and `git diff --check` passed.
- The QA run did not mutate source files; only ignored temporary output was produced.

The root agent repeated the complete focused and CI sequence after the runtime-proof preservation fix. After the first review fixes, governance tests passed 82/82, governance-impact tests passed 129/129, and privacy tests passed 23/23. A later independent diff review found that untracked release artifacts did not make `npm run validate` fail; that false-green gap was closed with a regression test.

A completion audit then found that the committed-artifact gate checked only path existence, not blob equality, and omitted the public CI workflow. The gate now requires every listed release artifact to exist in and match `HEAD`, including `.github/workflows/validate-starter.yml`. A separate regression locks the standalone runtime-proof validator to `npm run runtime:proof:mock` and its forced-mock wrapper. Current focused suites pass at governance 83/83, governance-impact 129/129, and privacy 24/24.

Before the first commit, a disposable selective candidate proved that the user-owned surfaces could be excluded without breaking the release unit. The implementation-only staged tree hash `f44d01f5e070061d2f259a9ced61bbdfaa0b02e6` then matched that full-CI candidate tree exactly. A subsequent audit-only staged tree intentionally differed while recording the commit verification; reviewed follow-up commit `281f3c1` captured that report without altering the implementation. Three independent implementation-tree reviewers returned PASS for change ownership, distribution/CI completeness, and runtime/privacy claim boundaries.

Local implementation commit `7f32cf9` was then checked from a clean detached worktree:

- `npm run ci` exited 0: governance 83/83, governance-impact 129/129, privacy 24/24, scenario schema 23/23, offline controls 5/5, forced-mock runtime proof for all three adapters, base/fullstack smoke, and fixtures all passed.
- Direct `validate` commands returned `OK` for `ambiguity-no-invention` (`686fd67cb59e4bc49a24fe10a2f8b5e042dff1c2ee7b43aa17288a9dba631170`), `requirements-sync` (`7111ee3d95596237a3d70e4e7c820e3ca59945d54f556e1772bb9063af02ea1a`), and `scope-guard` (`d91baacc549e3e15c67ff4bdd66241816d73fbf9369d2c89b066f77ea7ee8c8a`).
- Strict doctor passed for `base-minimal`, `fullstack-ai-saas`, and `macos-beta-handoff`.
- `npm pack --dry-run --json` exited 0 with 173 entries and 896,363 unpacked bytes.
- Immediately after implementation commit `7f32cf9` and before the first report update, the original source worktree failed the committed-artifact gate only for `README.md`, exactly because the authorized commit preserved its pre-existing product-route hunks outside `HEAD`. Editing this report temporarily added audit-file drift; reviewed commit `281f3c1` closed that drift and restored `README.md` as the source worktree's only committed-artifact mismatch.
- The evaluator still fails closed with `SCENARIO_NOT_COMMITTED` when a selected scenario is absent from `HEAD`; the committed scenario validations above prove the accepted path.

The evidence-only follow-up commit `281f3c1` was also checked from a clean detached worktree. `npm run ci`, three direct scenario validations, three strict doctors, `npm run runtime:proof`, and `git diff --check` passed. `npm pack --dry-run --json` exited 0 with 173 entries and 897,282 unpacked bytes.

No real external runtime CLI, deployment, push, or release was executed.

## Blocking Decisions And Evidence

1. Completion criterion 4 is not literal evidence of a real run. The safe current boundary is “real adapters are wired but fail closed pending containment proof.” Proving a live runtime requires a separately approved safety-supervisor workstream.
2. Ubuntu, macOS, and Windows hosted CI evidence requires a separately authorized push or PR. Local macOS commit evidence must not be presented as the hosted matrix.

## Criterion 4 Unlock Contract

The current host-process implementation is a no-go for a real Codex run: POSIX process groups cannot prove that a `setsid` or re-parented descendant was contained, and Windows has no proven direct equivalent in this harness.

The recommended route is a manually approved disposable Linux supervisor backed by cgroup v2 or an equivalently isolated container boundary. Completion requires tests that prove whole-boundary kill and emptiness after normal exit, timeout, client crash, detached descendants, and cleanup failure; no artifact may be persisted before that proof. The execution image, containment policy, network policy, and credential-delivery mechanism must be pinned and identical across both arms.

This route requires explicit approval because it introduces a containment dependency, a new evidence-schema identity, external network use, and access to a runtime credential. Public CI, macOS, and Windows must remain fail-closed. The project must not substitute a host process-group test or a fake runtime for this criterion.

## Change Ownership Boundary

The reviewed overhaul was committed with a hunk-level ownership boundary:

- Commit `7f32cf9` contains only the governance-impact/runtime-proof/committed-artifact README hunks; its pre-existing product-route wording remains unstaged in the source worktree.
- `docs/adr/000-template.md`, `templates/README.md`, and `workflows/fullstack.md` remain unstaged and unchanged by the commit.
- The validator no longer depends on the pre-existing `README.md` product-route wording or the `docs/adr/000-template.md` additions, so those user-owned hunks can remain outside an overhaul commit without creating a false dependency.
- The clean reviewed commit passed complete local CI after excluding those user-owned surfaces. Because release validation intentionally rejects any dirty required file, release validation must run from the clean commit rather than from the source worktree that still contains preserved README hunks.
- Evaluator/runtime-proof code, all three scenario trees, privacy tests, public docs, package/CI wiring, and this audit report form one dependency-coupled release unit.

## Release Boundary

Offline controls, synthetic fixtures, mock runtime proof, and local QA do not establish real-world governance effectiveness. Until Criterion 4 and the hosted matrix are resolved, this overhaul must not be described as release-ready or as proven to improve arbitrary agents or projects.

The current package tarball and clean local consumer install pass, including both CLI binaries and an initialized base project. The package still relies on npm's `.gitignore` fallback rather than an explicit `files` allowlist; that is a publish-surface drift risk, not a current delivery blocker.
