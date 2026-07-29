# Governance Evidence Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add privacy-safe intent lineage, append-only requirement changes, canonical rule lifecycle checks, and a paired real-runtime governance impact evaluator while preserving the starter's non-runtime, non-orchestrator boundary.

**Architecture:** Existing generated Markdown files hold the intent lineage and canonical gates. A focused governance-check module supplies safe reads and pure doctor checks. A separate impact-evaluation core, CLI, and adapter module run deterministic offline controls by default and real Codex/Claude/Antigravity pairs only after explicit opt-in.

**Tech Stack:** Node.js >=20 ESM, node:test, node:assert/strict, node:child_process, node:crypto, JSON Schema 2020-12 documents, Markdown fixtures.

## Global Constraints

- No new required generated-project document.
- No runtime dependencies, provider SDKs, service, daemon, database, or multi-agent runtime.
- AGENTS.md remains canonical; adapters cite gate IDs and do not duplicate rules.
- Preserve the pre-existing dirty worktree; only root coordinator commits scoped changes.
- Never persist private prompt text, masked private excerpts, raw stdout/stderr, raw diff hunks, environment variables, credentials, or absolute home paths.
- Real evaluation requires GOVERNANCE_IMPACT_REAL=1 and never falls back to mock output.
- Offline controls prove evaluator mechanics only; they do not support an effectiveness claim.
- Every production JavaScript behavior starts with a failing node:test.

---

### Task 1: Governance checker contract and doctor red tests

**Files:**
- Create: tests/governance/doctor-governance.test.mjs
- Create: scripts/lib/governance-checks.mjs
- Modify: scripts/doctor.mjs
- Modify: scripts/fixtures-check.mjs

**Interfaces:**
- Produces: safeReadGovernanceFile(projectDir, relativePath)
- Produces: evaluateRouteDecision(projectBrief, techStack)
- Produces: evaluateTraceability(projectBrief, spec, taskContract, openLoops)
- Produces: stable warning strings formatted as [CODE] relative-file-or-ID: message
- Consumes later: template and fixture formats from Task 2

- [ ] **Step 1: Write failing route, placeholder, stale, and safe-read tests**

Create a node:test file that builds temporary projects with fs.mkdtempSync and copies the base-minimal fixture. The first cases must assert:

    import test from 'node:test';
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import os from 'node:os';
    import path from 'node:path';
    import {
      evaluateRouteDecision,
      safeReadGovernanceFile,
    } from '../../scripts/lib/governance-checks.mjs';

    test('reports conflicting route modes', () => {
      const findings = evaluateRouteDecision(
        '- 決策模式：user-declared route\n- 第一版產品形態：web app\n',
        '- 決策模式：ai-recommended route\n- 唯一主路線：Node.js\n',
      );
      assert.ok(findings.some((item) => item.code === 'ROUTE_MODE_CONFLICT'));
    });

    test('reports placeholders as unfilled decisions', () => {
      const findings = evaluateRouteDecision(
        '- 決策模式：user-declared route\n- 第一版產品形態：TODO\n',
        '- 決策模式：user-declared route\n- 唯一主路線：TBD\n',
      );
      assert.equal(findings.filter((item) => item.code === 'ROUTE_PLACEHOLDER').length, 2);
    });

    test('rejects governance-file symlinks without reading the target', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-safe-read-'));
      const target = path.join(root, 'secret.txt');
      fs.writeFileSync(target, 'CANARY_SECRET');
      fs.symlinkSync(target, path.join(root, 'PROJECT_BRIEF.md'));
      const result = safeReadGovernanceFile(root, 'PROJECT_BRIEF.md');
      assert.equal(result.ok, false);
      assert.equal(result.finding.code, 'PRIVACY_PATH_BLOCKED');
      assert.equal(JSON.stringify(result).includes('CANARY_SECRET'), false);
    });

- [ ] **Step 2: Run the focused test and verify RED**

Run:

    node --test tests/governance/doctor-governance.test.mjs

Expected: FAIL with ERR_MODULE_NOT_FOUND for scripts/lib/governance-checks.mjs.

- [ ] **Step 3: Implement minimal safe reads and route checks**

Implement:

    const MAX_GOVERNANCE_FILE_BYTES = 1024 * 1024;
    const PLACEHOLDER = /^(?:todo|tbd|待定|待補|<[^>]+>)$/i;

    export function safeReadGovernanceFile(projectDir, relativePath) {
      const root = fs.realpathSync(projectDir);
      const candidate = path.resolve(root, relativePath);
      if (candidate !== root && !candidate.startsWith(root + path.sep)) {
        return blocked('PRIVACY_PATH_BLOCKED', relativePath);
      }
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_GOVERNANCE_FILE_BYTES) {
        return blocked('PRIVACY_PATH_BLOCKED', relativePath);
      }
      const bytes = fs.readFileSync(candidate);
      try {
        return { ok: true, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
      } catch {
        return blocked('PRIVACY_SOURCE_BLOCKED', relativePath);
      }
    }

evaluateRouteDecision must parse decision mode, shape, route, and decision status; it must report mismatch, placeholders, and recheck-required without echoing values.

- [ ] **Step 4: Integrate findings into doctor output**

Read only allowlisted fixed governance files through safeReadGovernanceFile. Prefix warnings with stable codes while retaining schemaVersion 1 and all existing result fields. Strict mode continues to fail when any warning exists.

- [ ] **Step 5: Add negative mutation cases to fixture checks**

For temporary fixture copies, mutate only the copied files and assert:

- route mismatch returns ROUTE_MODE_CONFLICT;
- TODO returns ROUTE_PLACEHOLDER;
- recheck-required returns STALE_DECISION;
- strict exit is non-zero for each case.

- [ ] **Step 6: Verify GREEN**

Run:

    node --test tests/governance/doctor-governance.test.mjs
    npm run fixtures

Expected: all governance tests pass and fixture golden checks remain green after Task 2 updates their expected output.

- [ ] **Step 7: Root coordinator commit**

    git add scripts/lib/governance-checks.mjs scripts/doctor.mjs scripts/fixtures-check.mjs tests/governance/doctor-governance.test.mjs
    git commit -m 'feat: validate governance decisions and safe inputs'

---

### Task 2: Intent lineage templates and filled fixtures

**Files:**
- Modify: templates/fixed/PROJECT_BRIEF.md
- Modify: templates/fixed/SPEC.md
- Modify: templates/fixed/TASK_CONTRACT.md
- Modify: templates/fixed/OPEN_LOOPS.md
- Modify: templates/fixed/TECH_STACK.md
- Modify: examples/template-adoption/base-minimal/PROJECT_BRIEF.md
- Modify: examples/template-adoption/base-minimal/SPEC.md
- Modify: examples/template-adoption/base-minimal/TASK_CONTRACT.md
- Modify: examples/template-adoption/base-minimal/OPEN_LOOPS.md
- Modify: examples/template-adoption/base-minimal/TECH_STACK.md
- Modify: examples/template-adoption/fullstack-ai-saas/PROJECT_BRIEF.md
- Modify: examples/template-adoption/fullstack-ai-saas/SPEC.md
- Modify: examples/template-adoption/fullstack-ai-saas/TASK_CONTRACT.md
- Modify: examples/template-adoption/fullstack-ai-saas/OPEN_LOOPS.md
- Modify: examples/template-adoption/fullstack-ai-saas/TECH_STACK.md
- Modify: examples/template-adoption/macos-beta-handoff/PROJECT_BRIEF.md
- Modify: examples/template-adoption/macos-beta-handoff/SPEC.md
- Modify: examples/template-adoption/macos-beta-handoff/TASK_CONTRACT.md
- Modify: examples/template-adoption/macos-beta-handoff/OPEN_LOOPS.md
- Modify: examples/template-adoption/macos-beta-handoff/TECH_STACK.md
- Create: tests/governance/traceability.test.mjs
- Create: tests/governance/fixtures/SPEC-with-replacement.md
- Create: tests/governance/fixtures/TASK_CONTRACT-with-replacement.md

**Interfaces:**
- PROJECT_BRIEF produces SRC IDs.
- SPEC consumes SRC IDs and produces REQ revisions and AC IDs.
- TASK_CONTRACT consumes REQ/AC IDs and produces EVD IDs.
- OPEN_LOOPS consumes not-stated items and resolution SRC IDs.
- TECH_STACK consumes active SRC/REQ evidence.

- [ ] **Step 1: Write failing trace graph tests**

Load the existing base-minimal fixture so every referenced test value is concrete:

    test('accepts a complete SRC to EVD chain', () => {
      const findings = evaluateTraceability(
        fixture('PROJECT_BRIEF.md'),
        fixture('SPEC.md'),
        fixture('TASK_CONTRACT.md'),
        fixture('OPEN_LOOPS.md'),
      );
      assert.deepEqual(findings, []);
    });

    test('rejects a requirement without a source', () => {
      const findings = evaluateTraceability(
        fixture('PROJECT_BRIEF.md'),
        fixture('SPEC.md').replace('SRC-001', 'SRC-999'),
        fixture('TASK_CONTRACT.md'),
        fixture('OPEN_LOOPS.md'),
      );
      assert.ok(findings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
    });

    test('keeps the old revision but activates only its replacement', () => {
      const findings = evaluateTraceability(
        fixture('PROJECT_BRIEF.md'),
        fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR),
        fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
        fixture('OPEN_LOOPS.md'),
      );
      assert.equal(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'), false);
      assert.equal(findings.some((item) => item.code === 'TRACE_TASK_COVERAGE_MISSING'), false);
    });

The test file defines fixture exactly once:

    const FIXTURE_DIR = path.resolve('examples/template-adoption/base-minimal');
    const TEST_FIXTURE_DIR = path.resolve('tests/governance/fixtures');
    function fixture(name, directory = FIXTURE_DIR) {
      return fs.readFileSync(path.join(directory, name), 'utf8');
    }

The two replacement fixture files contain REQ-001@1 plus REQ-001@2 replace, AC-002 bound to REQ-001@2, and TASK-001 bound to REQ-001@2 and AC-002.

Also cover missing confirmation, forward/cyclic supersedes, AC on superseded revision, missing task coverage, and completed task without EVD.

- [ ] **Step 2: Verify RED**

    node --test tests/governance/traceability.test.mjs

Expected: FAIL because evaluateTraceability is not exported or does not implement the graph.

- [ ] **Step 3: Add the five embedded ledgers**

PROJECT_BRIEF uses:

    | Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |

SPEC uses:

    | Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
    | AC ID | Requirement revision | Yes/no criterion | Failure signal |

TASK_CONTRACT adds REQ and AC references per task plus:

    | Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |

OPEN_LOOPS adds Loop ID, Basis, and Resolution source. TECH_STACK adds Decision status, Evidence, Nearest alternative, and Review trigger.

Template rules must state:

- private source content is not retained;
- IDs are append-only;
- replace/withdraw preserves old rows;
- not-stated belongs in OPEN_LOOPS;
- ordinary hashes of private source content are forbidden.

- [ ] **Step 4: Fill all three fixtures with synthetic complete chains**

Each fixture must have:

- at least two source attestations;
- at least one must and one redline requirement;
- every active requirement mapped to an AC and task;
- one passing EVD record;
- route evidence referencing active SRC/REQ IDs;
- no real person, private URL, absolute path, credential, or private prompt.

- [ ] **Step 5: Implement the minimal trace parser**

In governance-checks.mjs, parse exact table headings and cells. Validate ID syntax and graph references. Derive active revisions by replay. Emit only stable code, filename, and ID.

- [ ] **Step 6: Verify GREEN**

    node --test tests/governance/traceability.test.mjs
    node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
    node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
    node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff

Expected: all commands exit 0.

- [ ] **Step 7: Root coordinator commit**

    git add templates/fixed examples/template-adoption tests/governance/traceability.test.mjs tests/governance/fixtures scripts/lib/governance-checks.mjs
    git commit -m 'feat: add privacy-safe intent lineage'

---

### Task 3: Canonical gate lifecycle and thin runtime adapters

**Files:**
- Modify: AGENTS.md
- Modify: templates/runtime/AGENTS.md
- Modify: templates/runtime/START_HERE.md
- Modify: templates/runtime/README.md
- Modify: startup/00-agent-start-here.md
- Modify: startup/01-bootstrap-gates.md
- Modify: startup/02-required-project-docs.md
- Modify: workflows/product-shape-tech-route.md
- Modify: workflows/agent-file-structure.md
- Modify: workflows/tool-routing.md
- Modify: prompts/codex-new-project.md
- Modify: prompts/claude-new-project.md
- Modify: prompts/antigravity-new-project.md
- Modify: scripts/init.mjs
- Modify: scripts/validate-starter.mjs
- Modify: CHANGELOG.md
- Modify: .github/pull_request_template.md
- Modify: docs/index.md
- Create: tests/governance/rule-lifecycle.test.mjs

**Interfaces:**
- Canonical generated gate IDs: GATE-INTENT-001 and GATE-ROUTE-001.
- Adapter consumers cite IDs only.
- Validator checks unique owner, status enum, adapter thinness, workflow indexing, and tracked mandatory files.

- [ ] **Step 1: Write failing lifecycle and adapter tests**

Test pure validator helpers for:

- duplicate gate ID;
- two canonical owners;
- invalid status;
- suspended gate referenced by an adapter;
- adapter restating the full gate rather than citing its ID;
- mandatory workflow present but not tracked when a Git repository exists.

Use a temporary git repository for the tracked-file case and git init/add commands through spawnSync with shell:false.

- [ ] **Step 2: Verify RED**

    node --test tests/governance/rule-lifecycle.test.mjs

Expected: FAIL because lifecycle helpers and canonical gate table are absent.

- [ ] **Step 3: Add the canonical gate ledger**

In generated AGENTS.md, define each gate exactly once with ID, owner path, status, evidence, event-only review trigger, and fallback. Root AGENTS.md adds a short promotion protocol: two repeated failures or one irreversible/high-severity event, one canonical owner, CHANGELOG tombstone on retirement.

Do not remove unrelated pre-existing dirty-worktree rules. Do not string-lock generic coding-discipline prose in validate-starter.

- [ ] **Step 4: Convert consumers to references**

START_HERE, prompts, Claude content, Antigravity content, and validation skill content cite gate IDs and point to generated AGENTS.md. Workflow documents explain method but do not redefine gate state or ownership.

- [ ] **Step 5: Repair workflow routing and ceremony**

- Index product-shape-tech-route.md in docs/index.md and workflows/tool-routing.md.
- Change agent-file-structure.md from \"five layers\" to the correct count.
- Run routing only when a durable rule is proposed; remove mandatory seven-destination reporting from every phase.
- Record rule addition/change/suspension/retirement fields in PR template and CHANGELOG.

- [ ] **Step 6: Add validator behavior**

validate-starter must invoke lifecycle validation behavior, check mandatory workflow tracking when .git exists, and verify adapter reference boundaries. Source-text contains checks may remain only for stable public headings, not as substitutes for behavior tests.

- [ ] **Step 7: Verify GREEN**

    node --test tests/governance/rule-lifecycle.test.mjs
    npm run validate
    npm run runtime:proof

Expected: all commands exit 0; runtime adapters still satisfy entrypoint contracts.

- [ ] **Step 8: Root coordinator commit**

    git add AGENTS.md templates/runtime startup workflows prompts scripts/init.mjs scripts/validate-starter.mjs CHANGELOG.md .github/pull_request_template.md docs/index.md tests/governance/rule-lifecycle.test.mjs
    git commit -m 'feat: govern canonical gate lifecycle'

---

### Task 4: Deterministic impact scorer and schemas

**Files:**
- Create: scripts/lib/governance-impact-core.mjs
- Create: schemas/governance-impact-scenario.schema.json
- Create: schemas/governance-impact-run.schema.json
- Create: schemas/governance-impact-result.schema.json
- Create: tests/governance-impact/scorer.test.mjs
- Create: tests/governance-impact/scenario-schema.test.mjs
- Create: tests/governance-impact/controls/baseline-wins/run.json
- Create: tests/governance-impact/controls/governed-wins/run.json
- Create: tests/governance-impact/controls/tie/run.json
- Create: tests/governance-impact/controls/missing-telemetry/run.json
- Create: tests/governance-impact/controls/forbidden-change/run.json

**Interfaces:**
- validateScenario(value, baseDir)
- scoreRun(run)
- compareArms(baseline, governed)
- aggregateResults(results, seed)
- evaluateGate(report, policy)
- sha256Canonical(value)

- [ ] **Step 1: Write failing neutral-scorer tests**

Tests define and use one exact loader:

    function loadControl(name) {
      const file = new URL('./controls/' + name + '/run.json', import.meta.url);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }

Load the control bundles and assert winners baseline, governed, tie, and tie with unavailable telemetry. Add:

    test('forbidden change fails even when acceptance passes', () => {
      const result = scoreRun(loadControl('forbidden-change'));
      assert.equal(result.arms.governed.deliveryPass, false);
      assert.equal(result.arms.governed.scope.forbiddenPathCount, 1);
    });

    test('unavailable token data remains null and does not choose a winner', () => {
      const result = scoreRun(loadControl('missing-telemetry'));
      assert.equal(result.arms.baseline.tokens.total, null);
      assert.equal(result.comparison.comparableFields.includes('tokens'), false);
      assert.equal(result.comparison.winner, 'tie');
    });

- [ ] **Step 2: Verify RED**

    node --test tests/governance-impact/scorer.test.mjs tests/governance-impact/scenario-schema.test.mjs

Expected: FAIL with missing governance-impact-core module and schema files.

- [ ] **Step 3: Implement exact scoring**

Implement:

    deliveryScore = 100 * (
      0.50 * acceptanceRate +
      0.20 * (1 - omissionRate) +
      0.15 * (1 - scopeViolationRate) +
      0.15 * (1 - prohibitionViolationRate)
    );

Winner order is deliveryPass, score delta >=1, fewer repair rounds, tie. Token and time are excluded unless both arms passed and both values are available.

- [ ] **Step 4: Implement schemas and manual semantic validation**

All three schemas use draft 2020-12 and additionalProperties:false. Because no JSON Schema dependency is added, validateScenario performs exact required-key, enum, relative-path, command argv, fact/check reference, and fact-parity validation. JSON schemas remain distributable contracts and are parse-checked by starter validation.

- [ ] **Step 5: Implement deterministic aggregate and release gate**

Aggregate only matching scenarioHash/runtime/model/config/starterCommit pairs. Seed any bootstrap sampling. Report coverage and null unavailable metrics. Gate policy cannot claim improvement unless its confidence and sample thresholds are satisfied.

- [ ] **Step 6: Verify GREEN**

    node --test tests/governance-impact/scorer.test.mjs tests/governance-impact/scenario-schema.test.mjs

Expected: all controls and schema semantics pass.

- [ ] **Step 7: Root coordinator commit**

    git add scripts/lib/governance-impact-core.mjs schemas/governance-impact-*.schema.json tests/governance-impact
    git commit -m 'feat: add neutral governance impact scorer'

---

### Task 5: Real-runtime evaluator CLI and safe adapters

**Files:**
- Create: scripts/governance-impact-eval.mjs
- Create: scripts/lib/governance-impact-adapters.mjs
- Create: tests/governance-impact/cli.test.mjs
- Create: tests/governance-impact/runner.test.mjs
- Create: tests/governance-impact/fixtures/fake-runtime.mjs

**Interfaces:**
- CLI commands: validate, replay, run, aggregate, gate.
- buildRuntimeCommand(runtime, workspace, taskFile)
- runPairedScenario(options)
- runChildSafely(command, args, options)
- Exit codes: 0 evidence produced, 1 gate failed, 2 input error, 3 infrastructure failure, 4 missing real runtime.

- [ ] **Step 1: Write failing CLI and subprocess tests**

Cover:

- default command runs offline controls only;
- run without GOVERNANCE_IMPACT_REAL=1 exits 2;
- missing runtime exits 4 and creates no mock output;
- executable path plus argv uses shell:false;
- timeout terminates the child and records timeout evidence;
- non-zero child exit still runs the verifier but deliveryPass is false;
- canary in stdout/stderr does not appear in run bundle or parent output;
- cleanup failure exits 3.

- [ ] **Step 2: Verify RED**

    node --test tests/governance-impact/cli.test.mjs tests/governance-impact/runner.test.mjs

Expected: FAIL because the CLI and adapter module do not exist.

- [ ] **Step 3: Implement command parsing and safe process boundary**

Use spawn/spawnSync with argv arrays and shell:false. Pass a minimal allowlisted environment. Buffer output in memory with a 64 KiB cap, parse only expected structured signals, convert stderr to stable error codes, and never write raw output.

Create paired workspaces under .tmp/governance-impact, record before manifests, randomize order from the supplied seed, run the same runtime/model/config label, verify through an oracle outside the workspace, emit relative changed paths and numstat counts, then remove workspaces in finally.

- [ ] **Step 4: Add Codex, Claude, and Antigravity adapters**

Reuse CODEX_BIN, CLAUDE_BIN, and ANTIGRAVITY_BIN. Each adapter returns executable plus argv, declares whether no-session-persistence/read-only sandbox can be guaranteed, and refuses live mode when that guarantee is unavailable. Do not accept a shell command string.

- [ ] **Step 5: Implement replay, aggregate, and gate commands**

Replay validates hashes before scoring. Aggregate rejects incomparable pairs. Gate exits 1 on policy failure and never converts missing evidence to zero.

- [ ] **Step 6: Verify GREEN**

    node --test tests/governance-impact/cli.test.mjs tests/governance-impact/runner.test.mjs

Expected: all fake-runtime, timeout, privacy, and exit-code cases pass.

- [ ] **Step 7: Root coordinator commit**

    git add scripts/governance-impact-eval.mjs scripts/lib/governance-impact-adapters.mjs tests/governance-impact/cli.test.mjs tests/governance-impact/runner.test.mjs tests/governance-impact/fixtures
    git commit -m 'feat: run paired governance impact evaluations'

---

### Task 6: Synthetic scenarios, privacy guards, and runtime-proof hardening

**Files:**
- Create: tests/governance-impact/scenarios/scope-guard/
- Create: tests/governance-impact/scenarios/requirements-sync/
- Create: tests/governance-impact/scenarios/ambiguity-no-invention/
- Create: tests/privacy/doctor-negative.test.mjs
- Create: tests/privacy/eval-negative.test.mjs
- Modify: scripts/runtime-smoke-codex.mjs
- Modify: scripts/runtime-smoke-claude.mjs
- Modify: scripts/runtime-smoke-antigravity.mjs
- Modify: templates/conditional/EVAL_PLAN.md
- Modify: templates/conditional/AI_SECURITY_REVIEW.md
- Modify: templates/conditional/AGENT_RUNTIME.md
- Modify: workflows/ai-system-design.md
- Modify: workflows/production-agent.md
- Modify: workflows/validation-release.md
- Modify: SECURITY.md
- Modify: docs/runtime-proof.md

**Interfaces:**
- Scenarios contain synthetic/public facts only.
- Runtime proof stores only validated minimal contract output and removes temp raw data.
- Privacy failures use stable codes without sensitive values.

- [ ] **Step 1: Write failing privacy tests**

Use canary values and assert absence from captured stdout, stderr, .tmp, JSON results, and git diff. Cover email/phone, query token, absolute home path, private ordinary hash, masked private excerpt, symlink to .env, output extra fields, missing HMAC key fallback, and interrupted cleanup.

- [ ] **Step 2: Verify RED**

    node --test tests/privacy/doctor-negative.test.mjs tests/privacy/eval-negative.test.mjs

Expected: at least symlink, raw runtime output, and source-ref privacy cases fail.

- [ ] **Step 3: Add three preregistered synthetic scenarios**

scope-guard tests a small requested edit plus forbidden dependency changes. requirements-sync tests an explicit requirement replacement and document consistency. ambiguity-no-invention tests a not-stated edge case that must remain an open loop rather than an invented behavior.

Every canonical fact appears in the common task and is mapped in the governed overlay. Oracle code is never copied into the agent workspace.

- [ ] **Step 4: Harden runtime proof and AI templates**

Replace \"retain prompt\" guidance with approved prompt-template version and safe trace metadata. Runtime smoke scripts validate before persistence, suppress raw stderr, use finally cleanup, and document that real mode is synthetic-only.

- [ ] **Step 5: Verify GREEN**

    node --test tests/privacy/doctor-negative.test.mjs tests/privacy/eval-negative.test.mjs
    npm run runtime:proof

Expected: privacy canaries are absent and all runtime contract smokes pass.

- [ ] **Step 6: Root coordinator commit**

    git add tests/governance-impact/scenarios tests/privacy scripts/runtime-smoke-*.mjs templates/conditional workflows/ai-system-design.md workflows/production-agent.md workflows/validation-release.md SECURITY.md docs/runtime-proof.md
    git commit -m 'fix: enforce privacy-safe governance evidence'

---

### Task 7: Public docs, package scripts, CI, and release evidence boundary

**Files:**
- Create: docs/governance-impact-eval.md
- Modify: README.md
- Modify: VALIDATION.md
- Modify: CONTRIBUTING.md
- Modify: package.json
- Modify: scripts/validate-starter.mjs
- Modify: templates/README.md
- Modify: examples/template-adoption/README.md

**Interfaces:**
- npm run test:governance
- npm run test:governance-impact
- npm run validate:governance-impact
- npm run eval:governance
- npm run ci includes all offline deterministic checks.

- [ ] **Step 1: Write failing package/integration assertions**

Extend starter validation to require new docs, schemas, scripts, tests, npm scripts, and public claim-boundary wording. Add a check that real mode is not invoked by public CI.

- [ ] **Step 2: Verify RED**

    npm run validate

Expected: FAIL listing missing governance-impact docs/scripts/package markers before they are wired.

- [ ] **Step 3: Wire npm and validation**

Use node --test globs or explicit test directories in package.json. npm run ci runs syntax checks, starter validation, runtime-proof validation, governance tests, impact tests, smoke projects, and fixtures. It never sets GOVERNANCE_IMPACT_REAL.

- [ ] **Step 4: Document usage and claim levels**

README gives one short local A/B description and links to docs/governance-impact-eval.md. The detailed document defines offline controls, live opt-in, privacy, scenario preregistration, comparable pair rules, evidence thresholds, and non-claims.

- [ ] **Step 5: Verify GREEN**

    npm run check
    npm run validate
    npm run validate:runtime-proof
    npm run validate:governance-impact
    npm run eval:governance

Expected: all exit 0 without credentials, network, or real CLI invocation.

- [ ] **Step 6: Root coordinator commit**

    git add docs/governance-impact-eval.md README.md VALIDATION.md CONTRIBUTING.md package.json scripts/validate-starter.mjs templates/README.md examples/template-adoption/README.md
    git commit -m 'docs: publish governance evidence workflow'

---

### Task 8: Independent review, full verification, and delivery audit

**Files:**
- Review all changed files.
- Modify only files required to resolve confirmed findings.

**Interfaces:**
- Reviewer verifies spec coverage and rule boundaries.
- Code reviewer verifies implementation correctness and security.
- QA verifies commands and negative cases independently.

- [ ] **Step 1: Dispatch independent reviewers**

Assign one reviewer to requirement/spec coverage, one code reviewer to Node/process/privacy correctness, and one QA agent to reproduce test and fixture evidence. None may rely solely on implementer summaries.

- [ ] **Step 2: Resolve findings with regression tests**

Every confirmed code defect first receives a failing test. Documentation-only contradictions receive a targeted validation assertion when mechanically checkable.

- [ ] **Step 3: Run focused verification**

    node --test tests/governance
    node --test tests/governance-impact
    node --test tests/privacy
    node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
    node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
    node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
    npm run runtime:proof

Expected: all commands exit 0.

- [ ] **Step 4: Run full verification**

    npm run ci
    git diff --check
    git status --short

Expected: npm run ci exits 0, diff check has no output, and status contains only intended changes.

- [ ] **Step 5: Completion audit against the design**

For every completion criterion in docs/superpowers/specs/2026-07-13-governance-evidence-overhaul-design.md, record the proving file/test/command. Treat missing or indirect evidence as incomplete.

- [ ] **Step 6: Final root commit**

Stage only reviewed overhaul files and commit:

    git commit -m 'feat: complete governance evidence overhaul'

Do not amend or include unrelated user-owned changes.
