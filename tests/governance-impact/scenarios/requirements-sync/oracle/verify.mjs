import { readFileSync } from 'node:fs';
import path from 'node:path';

function workspaceFromArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--workspace') process.exit(2);
  return argv[1];
}

function hasPrivateMarker(text) {
  return /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+[1-9]\d{7,14}\b|(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)|[?&](?:token|key|secret|password)=)/iu.test(text);
}

const workspace = workspaceFromArgs(process.argv.slice(2));
const expectedRequirements = `# Requirements\n\n| revision | state | response target |\n| --- | --- | --- |\n| REQ-001@1 | superseded | Respond to each request within 24 hours. |\n| REQ-001@2 | active | Respond to each request on the same business day. |\n`;
const expectedTaskBoard = '# Task board\n\nActive response target: REQ-001@2\n';
const expectedEvidencePlan = '# Evidence plan\n\nEvidence target: REQ-001@2\n';
const requirements = readFileSync(path.join(workspace, 'docs/requirements.md'), 'utf8');
const taskBoard = readFileSync(path.join(workspace, 'docs/task-board.md'), 'utf8');
const evidencePlan = readFileSync(path.join(workspace, 'docs/evidence-plan.md'), 'utf8');
const originals = {
  'docs/requirements.md': readFileSync(new URL('../seed/docs/requirements.md', import.meta.url), 'utf8'),
  'docs/task-board.md': readFileSync(new URL('../seed/docs/task-board.md', import.meta.url), 'utf8'),
  'docs/evidence-plan.md': readFileSync(new URL('../seed/docs/evidence-plan.md', import.meta.url), 'utf8'),
};
const candidates = {
  'docs/requirements.md': requirements,
  'docs/task-board.md': taskBoard,
  'docs/evidence-plan.md': evidencePlan,
};
const changedPaths = Object.keys(candidates).filter((name) => candidates[name] !== originals[name]);
const historicRow = '| REQ-001@1 | superseded | Respond to each request within 24 hours. |\n';
const preservedHistory = requirements.includes(historicRow);
const accepted = requirements === expectedRequirements && taskBoard === expectedTaskBoard && evidencePlan === expectedEvidencePlan;
const privacyPassed = !hasPrivateMarker(requirements + taskBoard + evidencePlan);

process.stdout.write(`${JSON.stringify({
  acceptanceChecks: [{ id: 'CHECK-001', passed: accepted, critical: true }],
  requirements: [{ id: 'FACT-001', omitted: !accepted }],
  scope: {
    changedPaths,
    allowedPaths: ['docs/evidence-plan.md', 'docs/requirements.md', 'docs/task-board.md'],
    forbiddenPaths: [],
  },
  prohibitions: [{ id: 'CHECK-002', violated: !preservedHistory, critical: true }],
  documentChecks: [{ id: 'CHECK-003', drifted: !accepted, critical: true }],
  privacyChecks: [{ id: 'CHECK-004', passed: privacyPassed, critical: true }],
  repairRounds: 0,
  time: { availability: 'unavailable', wallTimeMs: null },
  tokens: { availability: 'unavailable', total: null },
})}\n`);
