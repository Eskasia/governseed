# Governance Evidence Overhaul Delivery Audit

Date: 2026-07-26

Status: BLOCKED

This report records the independent review and local QA evidence for the governance evidence overhaul. It is a worktree artifact, not immutable release evidence until it is committed and the committed revision passes CI.

## Review Streams

| Stream | Scope | Result |
|---|---|---|
| Task 5 contract reviewer | Evaluator CLI, runner, schemas, scenarios, and completion contract | Local implementation passed; branch reproducibility is blocked while required files remain untracked |
| Task 5 security reviewer | Process launch, persistence, privacy, and fail-closed behavior | No unresolved evaluator finding; real Codex evaluation refuses before launch with `SESSION_SAFETY_UNAVAILABLE` |
| Task 6 runtime-proof reviewers | Runtime proof cleanup, publication, concurrency, and negative cases | PASS after regression coverage and independent re-review of prior-artifact preservation |
| Task 7 public-delivery reviewer | README, validation docs, package scripts, public CI, and claim boundaries | PASS after mechanically locking claim separation and mock-only public CI |
| Task 8 QA agent | Focused tests, strict doctors, smoke fixtures, full CI, and worktree mutation check | PASS on the current macOS worktree |
| Task 8 specification auditor | Completion criteria and branch-reproducible evidence | BLOCKED on criteria 4 and 5; criterion 8 is only a worktree artifact until commit |
| Task 8 security reviewer | Evaluator and runtime-proof attack paths | PASS; the prior-artifact deletion finding was reproduced, fixed, and closed by direct re-test |
| Final diff reviewer | Complete diff, untracked artifacts, validator, and release-readiness signals | Found a false-green gap for artifacts absent from `HEAD`; the validator now fails closed until required artifacts are committed |
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
| 5. Controls on all CI operating systems | PARTIAL | Local controls and tests pass on macOS; no committed Ubuntu/macOS/Windows CI run exists for this worktree |
| 6. Public surfaces agree | PARTIAL | Current worktree is aligned; untracked evaluator, scenario, privacy, and report files are absent from branch history |
| 7. Final-worktree commands | BLOCKED | A disposable selective candidate commit passed complete local CI after excluding the four user-owned surfaces; the source worktree correctly fails because required release-unit content is absent from or differs from `HEAD` |
| 8. Independent review and QA | PARTIAL | Independent security re-review and QA pass; the specification audit still blocks release evidence, and this report is not immutable until commit |

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

To test the intended commit boundary without changing the source branch, the root agent built a disposable Git mirror, excluded `docs/adr/000-template.md`, `templates/README.md`, `workflows/fullstack.md`, and the product-route-only README hunks, committed only the reviewable overhaul candidate in that temporary mirror, and ran `npm run ci`. The complete command passed, including starter validation, runtime-proof validation, all test suites, five controls, forced-mock runtime proof, both smoke projects, and fixtures. This is strong local candidate evidence, but it is not branch or cloud CI evidence.

On the source worktree, the final committed-artifact check reports exactly 29 required paths absent from `HEAD` and 19 required paths whose current content differs from `HEAD`, with no other validation error class.

No real external runtime CLI, deployment, push, or release was executed.

## Blocking Decisions And Evidence

1. Required evaluator, scenario, privacy, audit, workflow, and related implementation content is either absent from or different from `HEAD`. The evaluator correctly returns `SCENARIO_NOT_COMMITTED`, and an archive of the source branch cannot reproduce the candidate validation path. A local commit requires explicit authorization.
2. Completion criterion 4 is not literal evidence of a real run. The safe current boundary is “real adapters are wired but fail closed pending containment proof.” Proving a live runtime requires a separately approved safety-supervisor workstream.
3. Ubuntu, macOS, and Windows CI evidence must come from the committed revision.

## Criterion 4 Unlock Contract

The current host-process implementation is a no-go for a real Codex run: POSIX process groups cannot prove that a `setsid` or re-parented descendant was contained, and Windows has no proven direct equivalent in this harness.

The recommended route is a manually approved disposable Linux supervisor backed by cgroup v2 or an equivalently isolated container boundary. Completion requires tests that prove whole-boundary kill and emptiness after normal exit, timeout, client crash, detached descendants, and cleanup failure; no artifact may be persisted before that proof. The execution image, containment policy, network policy, and credential-delivery mechanism must be pinned and identical across both arms.

This route requires explicit approval because it introduces a containment dependency, a new evidence-schema identity, external network use, and access to a runtime credential. Public CI, macOS, and Windows must remain fail-closed. The project must not substitute a host process-group test or a fake runtime for this criterion.

## Change Ownership Boundary

The reviewed overhaul cannot be staged by whole-file assumption:

- `README.md` contains both overhaul documentation and pre-existing product-route wording. Only reviewed overhaul hunks may enter an overhaul commit.
- `docs/adr/000-template.md`, `templates/README.md`, and `workflows/fullstack.md` contain pre-existing user changes and require an explicit inclusion decision.
- The validator no longer depends on the pre-existing `README.md` product-route wording or the `docs/adr/000-template.md` additions, so those user-owned hunks can remain outside an overhaul commit without creating a false dependency.
- A disposable selective candidate proved that excluding those user-owned surfaces still passes complete local CI. Because release validation intentionally rejects any dirty required file, final release validation must run from the clean reviewed commit rather than from a source worktree that still contains preserved README hunks.
- Evaluator/runtime-proof code, all three scenario trees, privacy tests, public docs, package/CI wiring, and this audit report form one dependency-coupled release unit.

## Release Boundary

Offline controls, synthetic fixtures, mock runtime proof, and local QA do not establish real-world governance effectiveness. Until all blockers above are resolved, this overhaul must not be described as release-ready or as proven to improve arbitrary agents or projects.

The current package tarball and clean local consumer install pass, including both CLI binaries and an initialized base project. The package still relies on npm's `.gitignore` fallback rather than an explicit `files` allowlist; that is a publish-surface drift risk, not a current delivery blocker.
