#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.');
const isMain = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export const REQUIRED_GATE_IDS = Object.freeze([
  'GATE-INTENT-001',
  'GATE-ROUTE-001',
]);

const REQUIRED_GATE_HEADER = [
  'ID',
  'Owner path',
  'Status',
  'Evidence',
  'Event-only review trigger',
  'Fallback',
];

const GOVERNANCE_IMPACT_REAL_WORKFLOW =
  '.github/workflows/governance-impact-real.yml';
const GOVERNANCE_IMPACT_PREFLIGHT_WORKFLOW =
  '.github/workflows/governance-impact-preflight.yml';

function normalizeWorkflowPath(value) {
  return String(value).replaceAll('\\', '/');
}

function workflowTriggerKeys(content) {
  const lines = String(content).split(/\r?\n/u);
  const start = lines.findIndex((line) => /^on:\s*$/u.test(line));
  if (start < 0) return [];
  const keys = [];
  let directIndent = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^ */u)?.[0].length ?? 0;
    if (indent === 0) break;
    if (directIndent === null) directIndent = indent;
    if (indent !== directIndent) continue;
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s.*)?$/u);
    if (match) keys.push(match[1]);
  }
  return keys;
}

export function validateGovernanceImpactWorkflows(workflows = []) {
  const errors = [];
  for (const workflow of workflows) {
    const workflowPath = normalizeWorkflowPath(workflow?.path ?? '');
    const content = String(workflow?.content ?? '');
    const touchesRealBoundary =
      content.includes('GOVERNANCE_IMPACT_REAL') ||
      content.includes('OPENAI_API_KEY');
    if (workflowPath === GOVERNANCE_IMPACT_PREFLIGHT_WORKFLOW) {
      const triggerKeys = workflowTriggerKeys(content);
      if (
        triggerKeys.length !== 1
        || triggerKeys[0] !== 'workflow_dispatch'
      ) {
        errors.push(`${workflowPath} must be workflow_dispatch-only`);
      }
      if (!/^\s*runs-on\s*:\s*ubuntu-latest\s*$/mu.test(content)) {
        errors.push(`${workflowPath} must use the disposable Linux ubuntu-latest runner`);
      }
      if (
        !/^\s*permissions\s*:\s*$/mu.test(content)
        || !/^\s*contents\s*:\s*read\s*$/mu.test(content)
      ) {
        errors.push(`${workflowPath} must keep job permissions at contents: read`);
      }
      if (
        !content.includes('GOVERNANCE_IMPACT_REAL')
        || !content.includes('experimental/governance-impact/eval.mjs preflight')
      ) {
        errors.push(`${workflowPath} must run only the explicit OCI preflight command`);
      }
      if (
        content.includes('OPENAI_API_KEY')
        || content.includes('secrets.')
        || /^\s*environment\s*:/mu.test(content)
      ) {
        errors.push(`${workflowPath} must remain credential-free`);
      }
      continue;
    }
    if (workflowPath !== GOVERNANCE_IMPACT_REAL_WORKFLOW) {
      if (touchesRealBoundary) {
        errors.push(`${workflowPath} must not access governance-impact real mode or credentials`);
      }
      continue;
    }
    const triggerKeys = workflowTriggerKeys(content);
    if (
      triggerKeys.length !== 1
      || triggerKeys[0] !== 'workflow_dispatch'
    ) {
      errors.push(`${workflowPath} must be workflow_dispatch-only`);
    }
    if (!/^\s*environment\s*:\s*governance-impact-real\s*$/mu.test(content)) {
      errors.push(`${workflowPath} must use the approval-gated environment governance-impact-real`);
    }
    if (!/^\s*runs-on\s*:\s*ubuntu-latest\s*$/mu.test(content)) {
      errors.push(`${workflowPath} must use the disposable Linux ubuntu-latest runner`);
    }
    if (
      !/^\s*permissions\s*:\s*$/mu.test(content) ||
      !/^\s*contents\s*:\s*read\s*$/mu.test(content)
    ) {
      errors.push(`${workflowPath} must keep job permissions at contents: read`);
    }
    if (
      !content.includes('GOVERNANCE_IMPACT_REAL') ||
      !content.includes('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    ) {
      errors.push(`${workflowPath} must scope the environment credential to the real evaluator step`);
    }
    if (/--(?:api-key|credential)\b/u.test(content)) {
      errors.push(`${workflowPath} must not place a credential in argv`);
    }
  }
  return errors;
}

function hasRequiredGateHeader(content) {
  return String(content || '').split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return false;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    return cells.length === REQUIRED_GATE_HEADER.length
      && cells.every((cell, index) => cell === REQUIRED_GATE_HEADER[index]);
  });
}

function gateRows(document) {
  const rows = [];
  for (const [index, line] of String(document.content || '').split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.includes('GATE-')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (!/^GATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(cells[0] || '')) continue;
    rows.push({
      id: cells[0],
      ownerPath: cells[1] || '',
      status: cells[2] || '',
      evidence: cells[3] || '',
      reviewTrigger: cells[4] || '',
      fallback: cells[5] || '',
      documentPath: document.path,
      line: index + 1,
    });
  }
  return rows;
}

function gateHistoryRows(document) {
  const rows = [];
  for (const line of String(document?.content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.includes('GATE-')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (!/^GATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(cells[0] || '')) continue;
    rows.push({
      id: cells[0],
      change: cells[1] || '',
      status: cells[3] || '',
      supersededBy: cells[7] || '',
    });
  }
  return rows;
}

function referencedGateIds(content) {
  return new Set(String(content || '').match(/\bGATE-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) || []);
}

function activeGateIds(canonicalDocuments) {
  return [...new Set(canonicalDocuments
    .flatMap((document) => gateRows(document))
    .filter((row) => row.status === 'active')
    .map((row) => row.id))];
}

export function validateGateLifecycle({
  canonicalDocuments = [],
  adapterDocuments = [],
  requiredGateIds = REQUIRED_GATE_IDS,
  lifecycleHistoryDocument = null,
} = {}) {
  const errors = [];
  for (const document of canonicalDocuments) {
    if (!hasRequiredGateHeader(document.content)) {
      errors.push(`Canonical gate ledger ${document.path} is missing the required lifecycle header`);
    }
  }
  const rows = canonicalDocuments.flatMap((document) => gateRows(document));
  const rowsById = new Map();

  for (const row of rows) {
    const byDocument = rows.filter((candidate) => (
      candidate.id === row.id && candidate.documentPath === row.documentPath
    ));
    if (byDocument.length > 1 && byDocument[0] === row) {
      errors.push(`Duplicate gate ID ${row.id} in canonical owner ${row.documentPath}`);
    }

    if (!rowsById.has(row.id)) rowsById.set(row.id, []);
    rowsById.get(row.id).push(row);

    if (!['active', 'suspended'].includes(row.status)) {
      errors.push(`Invalid status for ${row.id}: ${row.status || '(empty)'}`);
    }

    for (const [field, label] of [
      ['ownerPath', 'owner path'],
      ['evidence', 'evidence'],
      ['reviewTrigger', 'event-only review trigger'],
      ['fallback', 'fallback'],
    ]) {
      if (!row[field]) errors.push(`${row.id} in ${row.documentPath} is missing ${label}`);
    }
  }

  for (const [id, definitions] of rowsById) {
    const owners = [...new Set(definitions.map((definition) => definition.documentPath))];
    if (owners.length > 1) {
      errors.push(`Multiple canonical owners for ${id}: ${owners.join(', ')}`);
    }
  }

  for (const id of requiredGateIds) {
    if (!rowsById.has(id)) errors.push(`Missing canonical gate ${id}`);
  }

  if (lifecycleHistoryDocument) {
    const canonicalIds = new Set(rows.map((row) => row.id));
    const history = gateHistoryRows(lifecycleHistoryDocument);
    for (const id of new Set(history.map((row) => row.id))) {
      if (canonicalIds.has(id)) continue;
      const hasTombstone = history.some((row) => (
        row.id === id
        && row.change === 'retire'
        && row.status === 'retired'
        && row.supersededBy
      ));
      if (!hasTombstone) {
        errors.push(`Historical gate ${id} left the canonical ledger without a CHANGELOG retirement tombstone`);
      }
    }
  }

  for (const consumer of adapterDocuments) {
    for (const definition of gateRows(consumer)) {
      errors.push(`Gate consumer ${consumer.path} restates gate ${definition.id}`);
    }
    for (const id of referencedGateIds(consumer.content)) {
      const definitions = rowsById.get(id);
      if (!definitions) {
        errors.push(`Gate consumer ${consumer.path} references undefined gate ${id}`);
        continue;
      }
      if (definitions.some((definition) => definition.status === 'suspended')) {
        errors.push(`Suspended gate ${id} is referenced by gate consumer ${consumer.path}`);
      }
    }
  }

  return errors;
}

export function validateAdapterGateReferences(
  adapterDocuments,
  canonicalDocuments,
) {
  const errors = [];
  const requiredGateIds = activeGateIds(canonicalDocuments);
  for (const adapter of adapterDocuments) {
    const references = referencedGateIds(adapter.content);
    for (const id of requiredGateIds) {
      if (!references.has(id)) errors.push(`Adapter ${adapter.path} must cite active gate ${id}`);
    }
    if (!String(adapter.content || '').includes('AGENTS.md')) {
      errors.push(`Adapter ${adapter.path} must point to canonical AGENTS.md`);
    }
  }
  return errors;
}

export function validateWorkflowIndexing(workflowPath, indexDocuments) {
  const errors = [];
  for (const document of indexDocuments) {
    if (!String(document.content || '').includes(workflowPath)) {
      errors.push(`${document.path} does not index ${workflowPath}`);
    }
  }
  return errors;
}

export function validateAuditStatus(content) {
  const match = String(content || '').match(/^Status: ([A-Z]+)$/mu);
  if (!match) return ['Delivery audit is missing an explicit status'];
  if (!['PASS', 'BLOCKED'].includes(match[1])) {
    return [`Delivery audit has invalid status: ${match[1]}`];
  }
  return [];
}

/**
 * spawnSync reports a command that never ran through `error`, or through a null
 * status when a signal killed it. Neither says anything about the file being
 * checked, so reading them as a per-file verdict blames the repository for the
 * environment. A checkout without a usable git yields no signal at all, and the
 * check fails closed once rather than once per file.
 */
function gitDidNotRun(result) {
  return Boolean(result.error) || result.status === null;
}

function gitUnavailableError(subject) {
  return `${subject} could not be verified: git could not be executed in this environment`;
}

function validateTrackedFiles(
  repoRoot,
  files,
  errorPrefix,
  spawnCommand = spawnSync,
) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return [];

  const errors = [];
  for (const file of files) {
    if (!fs.existsSync(path.join(repoRoot, file))) continue;
    const result = spawnCommand('git', ['ls-files', '--error-unmatch', '--', file], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    });
    if (gitDidNotRun(result)) return [gitUnavailableError('Git tracking')];
    if (result.status !== 0) errors.push(`${errorPrefix}: ${file}`);
  }
  return errors;
}

export function validateMandatoryWorkflowTracking(
  repoRoot,
  mandatoryFiles,
  spawnCommand = spawnSync,
) {
  return validateTrackedFiles(
    repoRoot,
    mandatoryFiles,
    'Mandatory workflow is not tracked by git',
    spawnCommand,
  );
}

export function validateRequiredArtifactCommit(
  repoRoot,
  requiredFiles,
  spawnCommand = spawnSync,
) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return [];

  const errors = [];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) continue;
    const result = spawnCommand('git', ['cat-file', '-e', `HEAD:${file}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    });
    if (gitDidNotRun(result)) return [gitUnavailableError('Required artifact commit state')];
    if (result.status !== 0) {
      errors.push(`Required repository artifact is not committed in HEAD: ${file}`);
      continue;
    }
    const diff = spawnCommand('git', ['diff', '--quiet', 'HEAD', '--', file], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    });
    if (gitDidNotRun(diff)) return [gitUnavailableError('Required artifact commit state')];
    if (diff.status !== 0) {
      errors.push(`Required repository artifact does not match committed HEAD: ${file}`);
    }
  }
  return errors;
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function markdownRefs(text) {
  const refs = new Set();
  const regex = /`([^`\n]+\.md|docs\/adr\/\*\.md|assets\/ASSET_MANIFEST\.md)`/g;
  let match;
  while ((match = regex.exec(text))) {
    refs.add(match[1]);
  }
  return [...refs];
}

function fail(errors, message) {
  errors.push(message);
}

function requireFile(errors, file) {
  if (!exists(file)) fail(errors, `Missing ${file}`);
}

function requireIncludes(errors, file, snippets) {
  if (!exists(file)) {
    fail(errors, `Missing ${file}`);
    return;
  }
  const content = readFile(file);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) fail(errors, `${file} missing required text: ${snippet}`);
  }
}

function lineCount(relativePath) {
  return readFile(relativePath).split(/\r?\n/).length;
}

function requireRealNewlines(errors, file) {
  if (!exists(file)) {
    fail(errors, `Missing ${file}`);
    return;
  }
  if (lineCount(file) < 2) {
    fail(errors, `${file} appears to be single-line; keep generated files with real newlines`);
  }
}

function collectFiles(relativeDir, predicate) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath, predicate));
    } else if (entry.isFile() && predicate(relativePath, absolutePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function templateMarkdownFiles() {
  return collectFiles('templates', (relativePath) => relativePath.endsWith('.md'));
}

function templateExists(doc) {
  return templateMarkdownFiles().some((file) => path.basename(file) === doc);
}

function uniqueByFile(items) {
  const byFile = new Map();
  for (const item of items) byFile.set(item.file, item);
  return [...byFile.values()];
}

function loadProfile(name, seen = new Set()) {
  const profilePath = `profiles/${name}.json`;
  if (!exists(profilePath)) {
    throw new Error(`Missing profile: ${profilePath}`);
  }
  if (seen.has(name)) {
    throw new Error(`Profile extends cycle: ${[...seen, name].join(' -> ')}`);
  }

  const profile = readJson(profilePath);
  if (!profile.extends) {
    return {
      ...profile,
      documents: profile.documents || [],
      conditionalHints: profile.conditionalHints || [],
    };
  }

  const parent = loadProfile(profile.extends, new Set([...seen, name]));
  return {
    ...parent,
    ...profile,
    documents: uniqueByFile([...(parent.documents || []), ...(profile.documents || [])]),
    conditionalHints: uniqueByFile([...(parent.conditionalHints || []), ...(profile.conditionalHints || [])]),
  };
}

function profileFiles() {
  return collectFiles('profiles', (relativePath) => relativePath.endsWith('.json'));
}

function validateProjectDoc(errors, profileFile, doc) {
  for (const key of ['file', 'template', 'category', 'required', 'trigger']) {
    if (!Object.hasOwn(doc, key)) fail(errors, `${profileFile} document missing ${key}`);
  }
  if (doc.template && !exists(`templates/${doc.template}`)) {
    fail(errors, `${profileFile} references missing template: templates/${doc.template}`);
  }
  if (doc.category && !['fixed', 'conditional', 'runtime'].includes(doc.category)) {
    fail(errors, `${profileFile} has invalid document category for ${doc.file}: ${doc.category}`);
  }
}

function validateProfile(errors, profileFile) {
  let profile;
  try {
    profile = readJson(profileFile);
  } catch (error) {
    fail(errors, `${profileFile} is not valid JSON: ${error.message}`);
    return;
  }

  for (const key of ['schemaVersion', 'name', 'description', 'documents']) {
    if (!Object.hasOwn(profile, key)) fail(errors, `${profileFile} missing required key: ${key}`);
  }

  for (const doc of profile.documents || []) validateProjectDoc(errors, profileFile, doc);
  for (const doc of profile.conditionalHints || []) validateProjectDoc(errors, profileFile, doc);

  if (profile.extends && !exists(`profiles/${profile.extends}.json`)) {
    fail(errors, `${profileFile} extends missing profile: profiles/${profile.extends}.json`);
  }
}

function packageScripts(errors) {
  if (!exists('package.json')) return {};
  try {
    return readJson('package.json').scripts || {};
  } catch (error) {
    fail(errors, `package.json is not valid JSON: ${error.message}`);
    return {};
  }
}

if (isMain) {
const errors = [];

const requiredRepositoryFiles = [
  'README.md',
  'CHANGELOG.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/migrations/governseed-brand-transition.md',
  'docs/research/2026-07-29-charter-name-audit.md',
  'docs/research/2026-07-29-governseed-name-audit.md',
  'docs/research/evidence/2026-07-29-tmview-governseed-no-results.png',
  'package.json',
  'AGENTS.md',
  'CLAUDE.md',
  'ANTIGRAVITY.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'ROADMAP.md',
  '.gitattributes',
  '.gitignore',
  'VALIDATION.md',
  'docs/index.md',
  'docs/tool-registry.md',
  'docs/runtime-proof.md',
  'docs/governance-impact-eval.md',
  'docs/research/source-adoption-matrix.md',
  'docs/adr/002-modular-core-and-adapter-boundary.md',
  'docs/adr/003-deliberation-and-role-assignment-model.md',
  'docs/adr/004-risk-to-policy-compiler.md',
  'docs/policy-compiler.md',
  'docs/enforcement-boundary.md',
  'docs/adr/005-target-materialization-and-attestation-boundary.md',
  'docs/superpowers/specs/2026-07-30-materialization-attestation-design.md',
  'docs/superpowers/plans/2026-07-30-milestone-3-materialization-attestation-plan.md',
  'docs/research/2026-07-29-codex-policy-capability-matrix.md',
  'docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md',
  'docs/superpowers/plans/2026-07-29-decision-role-foundation-plan.md',
  'docs/superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md',
  'docs/superpowers/plans/2026-07-29-risk-to-policy-compiler-plan.md',
  'workflows/research-synthesis.md',
  'templates/conditional/RESEARCH_SYNTHESIS.md',
  'docs/adr/001-linux-codex-oci-containment.md',
  'docs/superpowers/plans/2026-07-26-linux-codex-oci-containment.md',
  'docs/superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md',
  '.github/release.yml',
  '.github/workflows/validate-starter.yml',
  '.github/workflows/runtime-proof.yml',
  'tests/runtime/codex/expected-headings.txt',
  'tests/brand/brand-compatibility.test.mjs',
  'tests/runtime/claude/first-response.schema.json',
  'tests/runtime/antigravity/skill-template/SKILL.md',
  'scripts/smoke-base.mjs',
  'scripts/smoke-fullstack.mjs',
  'scripts/smoke-antigravity.mjs',
  'scripts/smoke-package.mjs',
  'scripts/fixtures-check.mjs',
  'scripts/validate-runtime-proof.mjs',
  'scripts/assert-claude-first-response.mjs',
  'scripts/runtime-smoke-codex.mjs',
  'scripts/runtime-smoke-claude.mjs',
  'scripts/runtime-smoke-antigravity.mjs',
  'scripts/runtime-proof-mock.mjs',
  'scripts/governance-impact-eval.mjs',
  'scripts/lib/governance-checks.mjs',
  'scripts/agent-governance.mjs',
  'scripts/lib/governance-artifacts.mjs',
  'scripts/lib/decision-role-core.mjs',
  'scripts/lib/decision-role-doctor.mjs',
  'scripts/lib/target-registry.mjs',
  'scripts/lib/policy-compiler-core.mjs',
  'scripts/lib/policy-compiler-project.mjs',
  'scripts/lib/codex-policy-adapter.mjs',
  'scripts/lib/claude-policy-adapter.mjs',
  'scripts/lib/claude-target-materializer.mjs',
  'scripts/lib/codex-target-materializer.mjs',
  'scripts/lib/target-attest.mjs',
  'scripts/lib/policy-compiler-doctor.mjs',
  'scripts/lib/governance-impact-core.mjs',
  'scripts/lib/governance-impact-adapters.mjs',
  'profiles/base.json',
  'profiles/fullstack-ai.json',
  'profiles/macos.json',
  'schemas/project-doc.schema.json',
  'schemas/doctor-output.schema.json',
  'schemas/risk-profile.schema.json',
  'schemas/source-lock.schema.json',
  'schemas/governance-pack.schema.json',
  'schemas/role-catalog.schema.json',
  'schemas/role-assignment.schema.json',
  'schemas/deliberation-plan.schema.json',
  'schemas/deliberation-result.schema.json',
  'schemas/policy-manifest.schema.json',
  'schemas/codex-policy-adapter.schema.json',
  'schemas/claude-policy-adapter.schema.json',
  'schemas/compile-receipt.schema.json',
  'schemas/materialize-receipt.schema.json',
  'schemas/attest-output.schema.json',
  'schemas/cli-output.schema.json',
  'schemas/governance-impact-scenario.schema.json',
  'schemas/governance-impact-preflight.schema.json',
  'schemas/governance-impact-run.schema.json',
  'schemas/governance-impact-result.schema.json',
  'tests/governance/doctor-governance.test.mjs',
  'tests/governance/rule-lifecycle.test.mjs',
  'tests/governance/traceability.test.mjs',
  'tests/governance/vocabulary-consistency.test.mjs',
  'tests/governance/template-language.test.mjs',
  'tests/governance/package-surface.test.mjs',
  'tests/decision-role/artifact-safety.test.mjs',
  'tests/decision-role/schema-contracts.test.mjs',
  'tests/decision-role/cli-contracts.test.mjs',
  'tests/decision-role/doctor-contracts.test.mjs',
  'tests/policy-compiler/artifact-safety.test.mjs',
  'tests/policy-compiler/attest-contracts.test.mjs',
  'tests/policy-compiler/attest-schema-contracts.test.mjs',
  'tests/policy-compiler/cli-contracts.test.mjs',
  'tests/policy-compiler/materialize-contracts.test.mjs',
  'tests/policy-compiler/core.test.mjs',
  'tests/policy-compiler/doctor-contracts.test.mjs',
  'tests/policy-compiler/fixture-contracts.test.mjs',
  'tests/policy-compiler/schema-contracts.test.mjs',
  'catalogs/governance-responsibilities.json',
  'tests/governance-impact/scorer.test.mjs',
  'tests/governance-impact/scenario-schema.test.mjs',
  'tests/governance-impact/cli.test.mjs',
  'experimental/governance-impact/eval.mjs',
  'experimental/governance-impact/oci-integration.mjs',
  'experimental/governance-impact/uds-relay.mjs',
  'experimental/governance-impact/lib/credential-proxy.mjs',
  'experimental/governance-impact/lib/oci-proxy-facade.mjs',
  'experimental/governance-impact/lib/oci-supervisor.mjs',
  'experimental/governance-impact/tests/credential-proxy.test.mjs',
  'experimental/governance-impact/tests/oci-integration.test.mjs',
  'experimental/governance-impact/tests/oci-proxy-facade.test.mjs',
  'experimental/governance-impact/tests/oci-supervisor.test.mjs',
  'experimental/governance-impact/tests/real-workflow.test.mjs',
  'tests/governance-impact/runner.test.mjs',
  'experimental/governance-impact/tests/uds-relay.test.mjs',
  'tests/governance-impact/fixtures/fake-runtime.mjs',
  'experimental/governance-impact/tests/fixtures/oci/Dockerfile',
  'experimental/governance-impact/tests/fixtures/oci/codex',
  'tests/privacy/doctor-negative.test.mjs',
  'tests/privacy/eval-negative.test.mjs',
  'experimental/governance-impact/tests/proxy-negative.test.mjs',
  'tests/privacy/runtime-proof-negative.test.mjs',
  'tests/governance-impact/scenarios/ambiguity-no-invention/scenario.json',
  'tests/governance-impact/scenarios/ambiguity-no-invention/task.md',
  'tests/governance-impact/scenarios/ambiguity-no-invention/governed-overlay/GOVERNANCE.md',
  'tests/governance-impact/scenarios/ambiguity-no-invention/oracle/verify.mjs',
  'tests/governance-impact/scenarios/ambiguity-no-invention/seed/src/confirmation.txt',
  'tests/governance-impact/scenarios/requirements-sync/scenario.json',
  'tests/governance-impact/scenarios/requirements-sync/task.md',
  'tests/governance-impact/scenarios/requirements-sync/governed-overlay/GOVERNANCE.md',
  'tests/governance-impact/scenarios/requirements-sync/oracle/verify.mjs',
  'tests/governance-impact/scenarios/requirements-sync/seed/docs/evidence-plan.md',
  'tests/governance-impact/scenarios/requirements-sync/seed/docs/requirements.md',
  'tests/governance-impact/scenarios/requirements-sync/seed/docs/task-board.md',
  'tests/governance-impact/scenarios/scope-guard/scenario.json',
  'tests/governance-impact/scenarios/scope-guard/task.md',
  'tests/governance-impact/scenarios/scope-guard/governed-overlay/GOVERNANCE.md',
  'tests/governance-impact/scenarios/scope-guard/oracle/verify.mjs',
  'tests/governance-impact/scenarios/scope-guard/seed/app/message.txt',
  'tests/governance-impact/scenarios/scope-guard/seed/package.json',
];

const decisionRoleFixtureFiles = collectFiles(
  'tests/decision-role/fixtures',
  () => true,
).map((file) => file.split(path.sep).join('/'));
if (decisionRoleFixtureFiles.length < 20) {
  fail(errors, 'Decision-role fixtures are incomplete');
}
requiredRepositoryFiles.push(...decisionRoleFixtureFiles);

const expectedPolicyCompilerFixtures = [
  'cross-platform-paths',
  'dry-run',
  'low-risk-codex',
  'malicious-pack-expansion',
  'owner-conflict',
  'publish-approval-codex',
  'restricted-data-codex',
  'stale-policy',
];
const actualPolicyCompilerFixtures = fs.readdirSync(
  path.join(root, 'tests/policy-compiler/fixtures'),
  { withFileTypes: true },
).filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (
  JSON.stringify(actualPolicyCompilerFixtures)
  !== JSON.stringify(expectedPolicyCompilerFixtures)
) {
  fail(errors, 'Policy compiler fixture set does not match the closed matrix');
}
for (const fixture of expectedPolicyCompilerFixtures) {
  requiredRepositoryFiles.push(
    `tests/policy-compiler/fixtures/${fixture}/case.json`,
  );
}

for (const file of requiredRepositoryFiles) {
  requireFile(errors, file);
}

for (const dir of ['startup', 'workflows', 'templates', 'scripts', 'docs', 'prompts', 'profiles', 'schemas', 'examples/template-adoption', 'tests/runtime']) {
  if (!exists(dir)) fail(errors, `Missing directory: ${dir}`);
}

// docs/index.md is the documentation map, but nothing compared it to the
// directory it maps, so it had drifted to omitting eight documents including
// four this validator lists as required.
{
  const index = readFile('docs/index.md');
  for (const file of collectFiles('docs', (name) => name.endsWith('.md'))) {
    const relative = file.split(path.sep).join('/').slice('docs/'.length);
    if (relative === 'index.md') continue;
    if (!index.includes(relative)) {
      fail(errors, `docs/index.md does not list docs/${relative}`);
    }
  }
}

for (const file of [
  'startup/00-agent-start-here.md',
  'startup/01-bootstrap-gates.md',
  'startup/02-required-project-docs.md',
  'workflows/product-shape-tech-route.md',
  'workflows/research-synthesis.md',
]) {
  requireFile(errors, file);
}

const runtimeAdapterPaths = [
  'templates/runtime/START_HERE.md',
  'templates/runtime/README.md',
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
  'scripts/init.mjs',
];
const workflowConsumerPaths = ['startup', 'workflows']
  .flatMap((directory) => collectFiles(
    directory,
    (relativePath) => relativePath.endsWith('.md'),
  ))
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => referencedGateIds(readFile(file)).size > 0);
const gateConsumerPaths = [...new Set([...runtimeAdapterPaths, ...workflowConsumerPaths])];
const gateCanonicalDocuments = exists('templates/runtime/AGENTS.md')
  ? [{ path: 'templates/runtime/AGENTS.md', content: readFile('templates/runtime/AGENTS.md') }]
  : [];
const gateLifecycleHistoryDocument = {
  path: 'CHANGELOG.md',
  content: exists('CHANGELOG.md') ? readFile('CHANGELOG.md') : '',
};
const gateConsumerDocuments = gateConsumerPaths
  .filter((file) => exists(file))
  .map((file) => ({ path: file, content: readFile(file) }));
const runtimeAdapterDocuments = runtimeAdapterPaths
  .filter((file) => exists(file))
  .map((file) => ({ path: file, content: readFile(file) }));
errors.push(...validateGateLifecycle({
  canonicalDocuments: gateCanonicalDocuments,
  adapterDocuments: gateConsumerDocuments,
  requiredGateIds: REQUIRED_GATE_IDS,
  lifecycleHistoryDocument: gateLifecycleHistoryDocument,
}));
errors.push(...validateAdapterGateReferences(runtimeAdapterDocuments, gateCanonicalDocuments));

const workflowIndexes = ['docs/index.md', 'workflows/tool-routing.md']
  .filter((file) => exists(file))
  .map((file) => ({ path: file, content: readFile(file) }));
const mandatoryWorkflowPaths = [
  'workflows/product-shape-tech-route.md',
  'workflows/research-synthesis.md',
];
for (const workflowPath of mandatoryWorkflowPaths) {
  errors.push(...validateWorkflowIndexing(workflowPath, workflowIndexes));
}
errors.push(...validateMandatoryWorkflowTracking(root, mandatoryWorkflowPaths));
errors.push(...validateRequiredArtifactCommit(root, requiredRepositoryFiles));

requireIncludes(errors, '.gitattributes', [
  '* text=auto eol=lf',
]);

for (const file of [
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
]) {
  requireIncludes(errors, file, [
    'START_HERE.md',
    'PROJECT_BRIEF.md',
    'SPEC.md',
    'CONTEXT.md',
    'TASK_CONTRACT.md',
    'OPEN_LOOPS.md',
    'TECH_STACK.md',
    'Q1-Q9',
  ]);
}

requireIncludes(errors, 'README.md', [
  '# GovernSeed',
  'Governance foundations for agent-native projects.',
  'GovernSeed is a local-first governance bootstrap generator',
  'Formal brand: `Eskasia GovernSeed`',
  'GovernSeed was previously developed as `agent-governance-starter`.',
  'actions/workflows/validate-starter.yml/badge.svg',
  'License-MIT',
  'node-%3E%3D20',
  'startup/01-bootstrap-gates.md',
  'startup/02-required-project-docs.md',
  'Generated base project tree',
  '## Runtime Proof',
  '## Community',
  'CODE_OF_CONDUCT.md',
  'README.md',
  'node governseed/scripts/doctor.mjs ./my-new-project',
  'agent-governance compile <project> --target codex',
  'docs/policy-compiler.md',
  '## Governance Impact',
  '## Conditional research synthesis',
  'workflows/research-synthesis.md',
  'docs/governance-impact-eval.md',
  'offline controls',
  'every release artifact to exist in and match `HEAD`',
]);

requireIncludes(errors, 'startup/01-bootstrap-gates.md', [
  'Product Shape / Technology Route Gate',
  'user-declared route',
  'ai-recommended route',
  'workflows/product-shape-tech-route.md',
  'Conditional Research Candidate Detection',
  'workflows/research-synthesis.md',
  'RESEARCH_SYNTHESIS.md',
]);

requireIncludes(errors, 'workflows/product-shape-tech-route.md', [
  'user-declared route',
  'ai-recommended route',
  'Q1-Q9',
  'PROJECT_BRIEF.md',
  'TECH_STACK.md',
  'New Technology Gate',
]);

requireIncludes(errors, 'workflows/research-synthesis.md', [
  '## Trigger',
  '## Confirmation',
  'Only after the user confirms',
  'RESEARCH_CONFIRMATION_MISSING',
  'material-first hybrid',
  '## Five-lens Scan',
  '## Evidence And Contradiction Rules',
  '## Layered Output',
  '## Self-review',
  'RESEARCH_SYNTHESIS.md',
  'do not authorize extra tools, model calls, or subagents',
  'advisory',
  'GATE-INTENT-001',
  'GATE-ROUTE-001',
]);

requireIncludes(errors, 'templates/conditional/RESEARCH_SYNTHESIS.md', [
  '## Activation Record',
  '## Executive Layer',
  '## Claim And Evidence Ledger',
  '## Five-lens Scan',
  'Practitioner',
  'Scholar',
  'Skeptic',
  'Economist',
  'Historian',
  '## Contradiction Map',
  '## Cross-lens Connections',
  '## Self-review',
  'Academic-rigor Rubric',
  'Advisory boundary',
]);

requireIncludes(errors, 'templates/README.md', [
  'conditional/RESEARCH_SYNTHESIS.md',
  'workflows/research-synthesis.md',
]);

requireIncludes(errors, 'AGENTS.md', [
  'canonical source of truth',
  'thin adapters',
  '## Rule Lifecycle',
]);

requireIncludes(errors, 'CLAUDE.md', [
  '@AGENTS.md',
  'thin Claude Code adapter',
]);

requireIncludes(errors, 'ANTIGRAVITY.md', [
  'not the official Antigravity runtime entrypoint',
  '.agents/AGENTS.md',
  '.agents/skills/*/SKILL.md',
]);

requireIncludes(errors, 'package.json', [
  '"check"',
  '"validate"',
  '"validate:runtime-proof"',
  '"smoke:base"',
  '"smoke:fullstack"',
  '"fixtures"',
  '"runtime:proof"',
  '"runtime:proof:codex"',
  '"runtime:proof:claude"',
  '"runtime:proof:antigravity"',
  '"runtime:proof:mock"',
  '"test:governance"',
  '"test:brand"',
  '"test:decision-role"',
  '"test:policy-compiler"',
  '"test:governance-impact"',
  '"test:privacy"',
  '"validate:governance-impact"',
  '"eval:governance"',
  '"ci"',
]);

const scripts = packageScripts(errors);
for (const [name, command] of Object.entries(scripts)) {
  if (/\brm\s+-rf\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only rm -rf`);
  if (/\bmkdir\s+-p\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only mkdir -p`);
  if (/\bgrep\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only grep`);
  if (/(^|[\s;&|])diff(\s|$)/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only diff`);
}

for (const requiredScript of [
  'check',
  'validate',
  'validate:runtime-proof',
  'test:governance',
  'test:brand',
  'test:decision-role',
  'test:policy-compiler',
  'test:governance-impact',
  'test:privacy',
  'validate:governance-impact',
  'eval:governance',
  'smoke:base',
  'smoke:fullstack',
  'fixtures',
  'runtime:proof:mock',
]) {
  if (!scripts.ci?.includes(`npm run ${requiredScript}`)) {
    fail(errors, `package.json script ci must invoke npm run ${requiredScript}`);
  }
}

for (const [name, command] of Object.entries(scripts)) {
  if (command.includes('GOVERNANCE_IMPACT_REAL')) {
    fail(errors, `package.json script ${name} must not invoke governance-impact real mode`);
  }
}

if (
  scripts['runtime:proof:mock']
  !== 'npm run validate:runtime-proof && node scripts/runtime-proof-mock.mjs'
) {
  fail(errors, 'package.json script runtime:proof:mock must equal the forced-mock wrapper');
}
if (String(scripts.ci ?? '').split(/\s*&&\s*/u).includes('npm run runtime:proof')) {
  fail(errors, 'package.json script ci must not invoke environment-sensitive runtime:proof');
}

requireIncludes(errors, 'scripts/runtime-proof-mock.mjs', [
  'runCodexProof',
  'runClaudeProof',
  'runAntigravityProof',
  '{ real: false }',
]);

requireIncludes(errors, '.github/ISSUE_TEMPLATE/bug_report.yml', [
  'problem_type',
  'reproduction',
  'expected',
  'actual',
  'profile',
  'agent_runtime',
  'doctor_output',
  'validation_commands',
]);

requireIncludes(errors, '.github/ISSUE_TEMPLATE/feature_request.yml', [
  'problem_type',
  'reproduction',
  'expected',
  'actual',
  'profile',
  'agent_runtime',
  'doctor_output',
  'validation_commands',
]);

requireIncludes(errors, '.github/pull_request_template.md', [
  '## Summary',
  '## Changed Surface',
  '## Validation',
  '## Generated Fixture Impact',
  '## Runtime Adapter Impact',
  '## Rule Lifecycle Impact',
  '## Docs Updated',
]);

requireIncludes(errors, '.github/release.yml', [
  'Features',
  'Fixes',
  'Docs',
  'Maintenance',
  'Breaking Changes',
]);

requireIncludes(errors, 'CODE_OF_CONDUCT.md', [
  'Expected Behavior',
  'Unacceptable Behavior',
  'Enforcement',
]);

requireIncludes(errors, 'docs/index.md', [
  'runtime-proof.md',
  'governance-impact-eval.md',
  'superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md',
  'prompts/codex-new-project.md',
]);

requireIncludes(errors, 'docs/superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md', [
  'Status:',
  '## Review Streams',
  '## Completion Criteria',
  '## Local QA Evidence',
  '## Blocking Decisions And Evidence',
  '## Criterion 4 Unlock Contract',
  '## Change Ownership Boundary',
  'SESSION_SAFETY_UNAVAILABLE',
  'SCENARIO_NOT_COMMITTED',
  'No real external runtime CLI, deployment, push, or release was executed.',
]);
if (exists('docs/superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md')) {
  errors.push(...validateAuditStatus(
    readFile('docs/superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md'),
  ));
}

requireIncludes(errors, 'VALIDATION.md', [
  'npm run runtime:proof',
  'RUNTIME_PROOF_REAL=1 npm run runtime:proof',
  'Ubuntu, macOS, and Windows',
  'npm run fixtures',
  'npm run test:governance',
  'npm run test:governance-impact',
  'npm run test:privacy',
  'npm run validate:governance-impact',
  'npm run eval:governance',
  'must never set `GOVERNANCE_IMPACT_REAL`',
  'npm run runtime:proof:mock',
  'required release artifacts must already exist in and match `HEAD`',
  'The shipped Codex evaluator refuses before launch with `SESSION_SAFETY_UNAVAILABLE`',
  'It does not imply that the separate governance-impact evaluator supports the same runtime.',
]);

requireIncludes(errors, 'CONTRIBUTING.md', [
  'npm run runtime:proof',
  'npm run test:governance-impact',
  'npm run validate:governance-impact',
  'npm run eval:governance',
  'Keep public CI offline',
  'Keep runtime-proof claims separate from governance-impact evaluator claims.',
  'Offline controls, generated fixtures, and mock runtime proof are not effectiveness evidence.',
  'staging alone and working-tree drift do not satisfy the `HEAD` evidence gate',
]);

requireIncludes(errors, 'docs/governance-impact-eval.md', [
  '## Offline Quick Start',
  '## Scenario Preregistration',
  '## Privacy, Process, and Persistence Boundary',
  '## Claim Gate',
  '## Non-Claims',
  '### Real-Run Unlock Contract',
  'Preregistered scenarios',
  '| 5 |',
  '| 3 |',
  '| 90% |',
  '| 95% |',
  '| 80% |',
  'SESSION_SAFETY_UNAVAILABLE',
  'Public CI must run only deterministic offline checks',
  'Runtime proof is a separate entrypoint-contract smoke test.',
  '| Codex / macOS or Linux | Refused with `SESSION_SAFETY_UNAVAILABLE`',
  'cgroup v2',
]);

for (const file of [
  'SECURITY.md',
  'docs/runtime-proof.md',
  'workflows/ai-system-design.md',
  'workflows/validation-release.md',
  'workflows/production-agent.md',
  'templates/conditional/EVAL_PLAN.md',
  'templates/conditional/AGENT_RUNTIME.md',
  'templates/conditional/AI_SECURITY_REVIEW.md',
]) {
  requireIncludes(errors, file, [
    'Codex',
    'containment',
  ]);
}

requireIncludes(errors, 'SECURITY.md', [
  'SESSION_SAFETY_UNAVAILABLE',
]);

requireIncludes(errors, 'docs/runtime-proof.md', [
  'SESSION_SAFETY_UNAVAILABLE',
  'entrypoint-contract smoke test',
  'governance-impact evaluator',
]);

requireIncludes(errors, 'templates/runtime/START_HERE.md', [
  'GovernSeed',
  '{{AGENT}}',
  '{{PROFILE_NAME}}',
  '{{INTAKE_QUESTIONS}}',
  '{{REQUIRED_DOCUMENTS}}',
  '## Governance Gate References',
]);

requireIncludes(errors, 'templates/runtime/README.md', [
  '# GovernSeed Project',
  'GovernSeed',
  'agent-governance-starter',
  '{{AGENT}}',
  '{{PROFILE_NAME}}',
  '{{REQUIRED_DOCUMENTS}}',
  'doctor.mjs',
]);

requireIncludes(errors, 'templates/runtime/AGENTS.md', [
  '## Governance Gates',
]);

requireIncludes(errors, 'templates/fixed/PROJECT_BRIEF.md', [
  '## Product shape decision',
  'Decision mode',
  'Product shape',
  'Q1-Q9 basis',
]);

requireIncludes(errors, 'templates/fixed/TECH_STACK.md', [
  '## Technology route decision',
  'Decision mode',
  'Primary route',
  'New technology gate',
  '| Frontend |',
  '| Backend |',
  '| Database |',
  '| Main framework / SDK |',
]);

for (const file of [
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
]) {
  requireIncludes(errors, file, [
    'user-declared route',
    'ai-recommended route',
  ]);
}

requireIncludes(errors, 'scripts/init.mjs', [
  'GovernSeed',
  'agent-governance-init',
  'product shape / technology route mode',
  'user-declared route',
  'ai-recommended route',
]);

requireIncludes(errors, 'scripts/doctor.mjs', [
  'GovernSeed',
  'agent-governance-doctor',
]);

requireIncludes(errors, 'scripts/agent-governance.mjs', [
  'GovernSeed',
  'Command: agent-governance',
]);

requireIncludes(errors, 'docs/migrations/governseed-brand-transition.md', [
  'legacy machine identifier',
  'compatibility text',
  'historical record',
  'completed repository transition',
  'Completed Repository Transition',
]);

for (const file of ['README.md', 'CLAUDE.md', 'ANTIGRAVITY.md']) {
  if (exists(file)) {
    const content = readFile(file);
    if (content.includes('then 01-bootstrap-gates.md') || content.includes('then 02-required-project-docs.md')) {
      fail(errors, `${file} has ambiguous startup path in first-message text`);
    }
  }
}

requireIncludes(errors, 'scripts/init.mjs', [
  '--agent',
  '--profile',
  '--all',
  'runtime/AGENTS.md',
  'runtime/START_HERE.md',
  'runtime/README.md',
  'startup/01-bootstrap-gates.md',
  '.agents/AGENTS.md',
  '.agents/skills/bootstrap-intake/SKILL.md',
]);
requireIncludes(errors, 'scripts/doctor.mjs', [
  '--strict',
  '--json',
  'warnings as failures',
  'RESEARCH_CONFIRMATION_MISSING',
  'User decision',
]);
requireIncludes(errors, '.github/workflows/validate-starter.yml', [
  'npm run ci',
  'ubuntu-latest',
  'macos-latest',
  'windows-latest',
]);

requireIncludes(errors, '.github/workflows/runtime-proof.yml', [
  'workflow_dispatch',
  'npm run runtime:proof:mock',
]);

for (const workflow of [
  '.github/workflows/validate-starter.yml',
  '.github/workflows/runtime-proof.yml',
]) {
  if (!exists(workflow)) continue;
  const content = readFile(workflow);
  if (content.includes('GOVERNANCE_IMPACT_REAL')) {
    fail(errors, `${workflow} must not set or invoke GOVERNANCE_IMPACT_REAL`);
  }
}

const governanceImpactWorkflows = collectFiles(
  '.github/workflows',
  (relativePath) => relativePath.endsWith('.yml') || relativePath.endsWith('.yaml'),
).map((workflow) => ({
  path: workflow,
  content: readFile(workflow),
}));
for (const error of validateGovernanceImpactWorkflows(governanceImpactWorkflows)) {
  fail(errors, error);
}

if (exists('.github/workflows/runtime-proof.yml')
  && readFile('.github/workflows/runtime-proof.yml').includes('RUNTIME_PROOF_REAL')) {
  fail(errors, '.github/workflows/runtime-proof.yml must keep public runtime proof in mock mode');
}

if (exists('scripts/init.mjs')) {
  const initScript = readFile('scripts/init.mjs');
  if (initScript.includes('function agentsContent')) {
    fail(errors, 'scripts/init.mjs must generate AGENTS.md from templates/runtime/AGENTS.md, not agentsContent()');
  }
  if (initScript.includes('Q1. What user and problem')) {
    fail(errors, 'scripts/init.mjs must read Q1-Q9 from startup/01-bootstrap-gates.md, not hardcode intake questions');
  }
}

for (const file of [
  'scripts/init.mjs',
  'scripts/doctor.mjs',
  'scripts/agent-governance.mjs',
  'scripts/validate-starter.mjs',
  'scripts/smoke-base.mjs',
  'scripts/smoke-fullstack.mjs',
  'scripts/smoke-antigravity.mjs',
  'scripts/smoke-package.mjs',
  'scripts/fixtures-check.mjs',
  'scripts/validate-runtime-proof.mjs',
  'scripts/assert-claude-first-response.mjs',
  'scripts/runtime-smoke-codex.mjs',
  'scripts/runtime-smoke-claude.mjs',
  'scripts/runtime-smoke-antigravity.mjs',
  'scripts/runtime-proof-mock.mjs',
  'scripts/governance-impact-eval.mjs',
  'scripts/lib/governance-checks.mjs',
  'scripts/lib/governance-artifacts.mjs',
  'scripts/lib/decision-role-core.mjs',
  'scripts/lib/decision-role-doctor.mjs',
  'scripts/lib/policy-compiler-core.mjs',
  'scripts/lib/policy-compiler-project.mjs',
  'scripts/lib/codex-policy-adapter.mjs',
  'scripts/lib/policy-compiler-doctor.mjs',
  'scripts/lib/governance-impact-core.mjs',
  'scripts/lib/governance-impact-adapters.mjs',
  'docs/adr/001-linux-codex-oci-containment.md',
  'docs/adr/002-modular-core-and-adapter-boundary.md',
  'docs/adr/003-deliberation-and-role-assignment-model.md',
  'docs/adr/004-risk-to-policy-compiler.md',
  'docs/policy-compiler.md',
  'docs/research/2026-07-29-codex-policy-capability-matrix.md',
  'docs/research/source-adoption-matrix.md',
  'docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md',
  'docs/superpowers/plans/2026-07-29-decision-role-foundation-plan.md',
  'docs/superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md',
  'docs/superpowers/plans/2026-07-29-risk-to-policy-compiler-plan.md',
  'docs/governance-impact-eval.md',
  'docs/superpowers/plans/2026-07-26-linux-codex-oci-containment.md',
  'schemas/governance-impact-scenario.schema.json',
  'schemas/governance-impact-preflight.schema.json',
  'schemas/governance-impact-run.schema.json',
  'schemas/governance-impact-result.schema.json',
  'tests/governance/doctor-governance.test.mjs',
  'tests/governance/rule-lifecycle.test.mjs',
  'tests/governance/traceability.test.mjs',
  'tests/decision-role/artifact-safety.test.mjs',
  'tests/decision-role/schema-contracts.test.mjs',
  'tests/decision-role/cli-contracts.test.mjs',
  'tests/decision-role/doctor-contracts.test.mjs',
  'tests/policy-compiler/artifact-safety.test.mjs',
  'tests/policy-compiler/cli-contracts.test.mjs',
  'tests/policy-compiler/core.test.mjs',
  'tests/policy-compiler/doctor-contracts.test.mjs',
  'tests/policy-compiler/fixture-contracts.test.mjs',
  'tests/policy-compiler/schema-contracts.test.mjs',
  'tests/governance-impact/scorer.test.mjs',
  'tests/governance-impact/scenario-schema.test.mjs',
  'tests/governance-impact/cli.test.mjs',
  'experimental/governance-impact/eval.mjs',
  'experimental/governance-impact/oci-integration.mjs',
  'experimental/governance-impact/uds-relay.mjs',
  'experimental/governance-impact/lib/credential-proxy.mjs',
  'experimental/governance-impact/lib/oci-proxy-facade.mjs',
  'experimental/governance-impact/lib/oci-supervisor.mjs',
  'experimental/governance-impact/tests/credential-proxy.test.mjs',
  'experimental/governance-impact/tests/oci-integration.test.mjs',
  'experimental/governance-impact/tests/oci-proxy-facade.test.mjs',
  'experimental/governance-impact/tests/oci-supervisor.test.mjs',
  'experimental/governance-impact/tests/real-workflow.test.mjs',
  'tests/governance-impact/runner.test.mjs',
  'experimental/governance-impact/tests/uds-relay.test.mjs',
  'tests/governance-impact/fixtures/fake-runtime.mjs',
  'experimental/governance-impact/tests/fixtures/oci/Dockerfile',
  'experimental/governance-impact/tests/fixtures/oci/codex',
  'tests/privacy/doctor-negative.test.mjs',
  'tests/privacy/eval-negative.test.mjs',
  'experimental/governance-impact/tests/proxy-negative.test.mjs',
  'tests/privacy/runtime-proof-negative.test.mjs',
  '.github/workflows/validate-starter.yml',
  '.github/workflows/runtime-proof.yml',
]) {
  requireRealNewlines(errors, file);
}

try {
  JSON.parse(readFile('tests/runtime/claude/first-response.schema.json'));
} catch (error) {
  fail(errors, `tests/runtime/claude/first-response.schema.json is not valid JSON: ${error.message}`);
}

if (exists('tests/runtime/antigravity/skill-template/SKILL.md')) {
  const skill = readFile('tests/runtime/antigravity/skill-template/SKILL.md');
  if (!/^name:\s*intake-audit$/m.test(skill) || !/^description:\s*\S+/m.test(skill)) {
    fail(errors, 'tests/runtime/antigravity/skill-template/SKILL.md frontmatter must include name and description');
  }
}

for (const file of templateMarkdownFiles()) {
  requireRealNewlines(errors, file);
}

for (const file of profileFiles()) {
  requireRealNewlines(errors, file);
  validateProfile(errors, file);
}

for (const file of collectFiles('schemas', (relativePath) => relativePath.endsWith('.json'))) {
  requireRealNewlines(errors, file);
  try {
    readJson(file);
  } catch (error) {
    fail(errors, `${file} is not valid JSON: ${error.message}`);
  }
}

if (!exists('templates/README.md')) {
  fail(errors, 'Missing templates/README.md');
} else {
  const templateReadme = readFile('templates/README.md');
  const templateRefs = markdownRefs(templateReadme).filter((ref) => /^[A-Z0-9_]+\.md$/.test(ref));
  for (const doc of templateRefs) {
    if (!templateExists(doc)) fail(errors, `templates/README.md lists missing template: ${doc}`);
  }
}

const examplesRoot = path.join(root, 'examples/template-adoption');
if (fs.existsSync(examplesRoot)) {
  let requiredExampleDocs = [];
  try {
    requiredExampleDocs = loadProfile('base').documents
      .filter((doc) => doc.required)
      .map((doc) => doc.file);
  } catch (error) {
    fail(errors, error.message);
  }

  const exampleDirs = fs.readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (exampleDirs.length < 2) {
    fail(errors, `Expected at least 2 template-adoption examples, found ${exampleDirs.length}`);
  }
  for (const dir of exampleDirs) {
    for (const doc of requiredExampleDocs) {
      const examplePath = `examples/template-adoption/${dir}/${doc}`;
      if (!exists(examplePath)) fail(errors, `Example ${dir} missing required doc: ${doc}`);
    }
  }
}

let projectOutputDocs = new Set(['assets/ASSET_MANIFEST.md', 'docs/adr/*.md']);
try {
  const docs = profileFiles().flatMap((profileFile) => {
    const profileName = path.basename(profileFile, '.json');
    const profile = loadProfile(profileName);
    return [...(profile.documents || []), ...(profile.conditionalHints || [])].map((doc) => doc.file);
  });
  projectOutputDocs = new Set([...projectOutputDocs, ...docs]);
} catch (error) {
  fail(errors, error.message);
}

if (exists('workflows/stage-routing.md')) {
  const routing = readFile('workflows/stage-routing.md');
  for (const ref of markdownRefs(routing)) {
    if (ref.startsWith('templates/')) {
      if (!exists(ref)) fail(errors, `stage-routing.md references missing template path: ${ref}`);
      continue;
    }
    if (ref.startsWith('workflows/') || ref.startsWith('startup/') || ref.startsWith('docs/')) {
      if (!exists(ref)) fail(errors, `stage-routing.md references missing file: ${ref}`);
      continue;
    }
    if (/^[A-Z0-9_]+\.md$/.test(ref) && !templateExists(ref) && !projectOutputDocs.has(ref)) {
      fail(errors, `stage-routing.md output lacks template or project-output allowlist: ${ref}`);
    }
  }
} else {
  fail(errors, 'Missing workflows/stage-routing.md');
}

for (const file of collectFiles('workflows', (relativePath) => relativePath.endsWith('.md'))) {
  const content = readFile(file);
  if (/^#\s+\d{2}\b/m.test(content)) {
    fail(errors, `${file} has a historical numbered H1; startup/00-02 is the only linear read order`);
  }
}

if (exists('docs/experiments/context-mode.md')) {
  const content = readFile('docs/experiments/context-mode.md');
  if (/^#\s+\d{2}\b/m.test(content)) {
    fail(errors, 'docs/experiments/context-mode.md has a historical numbered H1');
  }
}

const allMarkdown = [];
function collectMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const relativeDir = path.relative(root, fullPath);
      if (relativeDir === path.join('docs', 'research')) continue;
      collectMarkdown(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      allMarkdown.push(fullPath);
    }
  }
}
collectMarkdown(root);

for (const filePath of allMarkdown) {
  const relative = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const ref of markdownRefs(content)) {
    if (ref.includes('*')) continue;
    if (ref.startsWith('workflows/') || ref.startsWith('startup/') || ref.startsWith('docs/')) {
      if (!exists(ref)) fail(errors, `${relative} references missing file: ${ref}`);
    }
  }
}

const rootFiles = fs.readdirSync(root).filter((file) => /^\d{2}-.+\.md$/.test(file));
if (rootFiles.length > 0) {
  fail(errors, `Old numbered workflow files still in root: ${rootFiles.join(', ')}`);
}

if (errors.length > 0) {
  console.error('Starter validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Starter validation passed.');
}
