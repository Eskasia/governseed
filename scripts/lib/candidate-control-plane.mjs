import { createHash } from 'node:crypto';

export const POLICY_ID = 'GS-CANDIDATE-CONTROL-PLANE-SEPARATION-V1';
export const BODY_CANONICALIZATION = 'SHA-256 over the exact UTF-8 GitHub API .body string with no added delimiter';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EVENT_TYPES = new Set([
  'OWNER_DECISION', 'CHECKER_VERDICT', 'OWNER_APPROVAL', 'PR_READY', 'MERGE',
  'WORKFLOW_DISPATCH', 'FORMAL_LOCK', 'PILOT', 'CONFIRMATORY_EXECUTION',
  'SCORING', 'BENCHMARK_ACCEPTANCE', 'CONTROL_BINDING',
]);
const BRANCH_ROLES = new Set(['candidate', 'control-checkpoint']);
const EVENT_ACTION = Object.freeze({
  CHECKER_VERDICT: ['providerRequest', 'ONE_AUTHORIZED_READ_ONLY_CHECKER'],
  PR_READY: ['prReadiness', 'AUTHORIZED_AND_RUN'],
  MERGE: ['merge', 'AUTHORIZED_AND_RUN'],
  WORKFLOW_DISPATCH: ['workflowDispatch', 'AUTHORIZED_AND_RUN'],
  FORMAL_LOCK: ['formalLock', 'AUTHORIZED_AND_RUN'],
  PILOT: ['pilot', 'AUTHORIZED_AND_RUN'],
  CONFIRMATORY_EXECUTION: ['confirmatoryExecution', 'AUTHORIZED_AND_RUN'],
  SCORING: ['scoring', 'AUTHORIZED_AND_RUN'],
  BENCHMARK_ACCEPTANCE: ['benchmarkAcceptance', 'AUTHORIZED_AND_RUN'],
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, location, errors) {
  if (!isObject(value)) {
    errors.push(`${location}:object-required`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${location}:closed-shape`);
    return false;
  }
  return true;
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function pushIf(condition, error, errors) {
  if (condition) errors.push(error);
}

export function sha256ExactUtf8(value) {
  if (typeof value !== 'string') throw new TypeError('GitHub API .body must be a string');
  return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

export function validatePolicy(policy) {
  const errors = [];
  if (!exactKeys(policy, ['schemaVersion', 'policyId', 'status', 'scope', 'candidateFreeze', 'bodyHash', 'liveControlPlane', 'candidateBranch', 'checkpoint', 'separateHumanGates'], '$', errors)) return errors;
  pushIf(policy.schemaVersion !== 1, '$.schemaVersion', errors);
  pushIf(policy.policyId !== POLICY_ID, '$.policyId', errors);
  pushIf(!['active', 'suspended'].includes(policy.status), '$.status', errors);

  if (exactKeys(policy.scope, ['repository', 'issue', 'pullRequest'], '$.scope', errors)) {
    pushIf(policy.scope.repository !== 'Eskasia/governseed', '$.scope.repository', errors);
    pushIf(!Number.isInteger(policy.scope.issue) || policy.scope.issue < 1, '$.scope.issue', errors);
    pushIf(!Number.isInteger(policy.scope.pullRequest) || policy.scope.pullRequest < 1, '$.scope.pullRequest', errors);
  }
  if (exactKeys(policy.candidateFreeze, ['baseSha', 'headSha', 'treeSha', 'validationRun'], '$.candidateFreeze', errors)) {
    for (const key of ['baseSha', 'headSha', 'treeSha']) pushIf(!SHA_PATTERN.test(policy.candidateFreeze[key]), `$.candidateFreeze.${key}`, errors);
    pushIf(!Number.isInteger(policy.candidateFreeze.validationRun) || policy.candidateFreeze.validationRun < 1, '$.candidateFreeze.validationRun', errors);
  }
  if (exactKeys(policy.bodyHash, ['algorithm', 'canonicalization', 'source'], '$.bodyHash', errors)) {
    pushIf(policy.bodyHash.algorithm !== 'sha256', '$.bodyHash.algorithm', errors);
    pushIf(policy.bodyHash.canonicalization !== BODY_CANONICALIZATION, '$.bodyHash.canonicalization', errors);
    pushIf(policy.bodyHash.source !== 'raw GitHub API comment JSON parsed in-process', '$.bodyHash.source', errors);
  }
  if (exactKeys(policy.liveControlPlane, ['locations', 'appendOnly', 'editsAllowed', 'requiredCommentFields', 'chain'], '$.liveControlPlane', errors)) {
    pushIf(policy.liveControlPlane.appendOnly !== true, '$.liveControlPlane.appendOnly', errors);
    pushIf(policy.liveControlPlane.editsAllowed !== false, '$.liveControlPlane.editsAllowed', errors);
    pushIf(!Array.isArray(policy.liveControlPlane.locations) || policy.liveControlPlane.locations.length !== 2, '$.liveControlPlane.locations', errors);
    for (const [index, location] of (policy.liveControlPlane.locations ?? []).entries()) {
      if (exactKeys(location, ['kind', 'number'], `$.liveControlPlane.locations[${index}]`, errors)) {
        pushIf(!['issue', 'pull_request'].includes(location.kind), `$.liveControlPlane.locations[${index}].kind`, errors);
        pushIf(!Number.isInteger(location.number) || location.number < 1, `$.liveControlPlane.locations[${index}].number`, errors);
      }
    }
    const required = ['id', 'html_url', 'user.login', 'author_association', 'created_at', 'updated_at', 'body'].sort();
    pushIf(JSON.stringify([...(policy.liveControlPlane.requiredCommentFields ?? [])].sort()) !== JSON.stringify(required), '$.liveControlPlane.requiredCommentFields', errors);
    if (exactKeys(policy.liveControlPlane.chain, ['previousEventBindingRequired', 'tailMayRemainUnboundUntilNextEvent'], '$.liveControlPlane.chain', errors)) {
      pushIf(policy.liveControlPlane.chain.previousEventBindingRequired !== true, '$.liveControlPlane.chain.previousEventBindingRequired', errors);
      pushIf(policy.liveControlPlane.chain.tailMayRemainUnboundUntilNextEvent !== true, '$.liveControlPlane.chain.tailMayRemainUnboundUntilNextEvent', errors);
    }
  }
  if (exactKeys(policy.candidateBranch, ['forbiddenExactPaths', 'forbiddenPathPrefixes'], '$.candidateBranch', errors)) {
    for (const key of ['forbiddenExactPaths', 'forbiddenPathPrefixes']) {
      pushIf(!Array.isArray(policy.candidateBranch[key]) || policy.candidateBranch[key].length === 0, `$.candidateBranch.${key}`, errors);
    }
  }
  if (exactKeys(policy.checkpoint, ['branchRole', 'batchOnly', 'candidateHeadMustRemainUnchanged', 'allowedPathPrefixes'], '$.checkpoint', errors)) {
    pushIf(policy.checkpoint.branchRole !== 'control-checkpoint', '$.checkpoint.branchRole', errors);
    pushIf(policy.checkpoint.batchOnly !== true, '$.checkpoint.batchOnly', errors);
    pushIf(policy.checkpoint.candidateHeadMustRemainUnchanged !== true, '$.checkpoint.candidateHeadMustRemainUnchanged', errors);
    pushIf(!Array.isArray(policy.checkpoint.allowedPathPrefixes) || policy.checkpoint.allowedPathPrefixes.length === 0, '$.checkpoint.allowedPathPrefixes', errors);
  }
  const gates = ['provider_request', 'pr_readiness', 'merge', 'workflow_dispatch', 'formal_lock', 'pilot', 'confirmatory_execution', 'scoring', 'benchmark_acceptance'].sort();
  pushIf(JSON.stringify([...(policy.separateHumanGates ?? [])].sort()) !== JSON.stringify(gates), '$.separateHumanGates', errors);
  return errors;
}

function validateCandidate(candidate, policy, location, errors) {
  if (!exactKeys(candidate, ['repository', 'pullRequest', 'baseSha', 'headSha', 'treeSha', 'validationRun'], location, errors)) return;
  const frozen = policy.candidateFreeze;
  pushIf(candidate.repository !== policy.scope.repository, `${location}.repository`, errors);
  pushIf(candidate.pullRequest !== policy.scope.pullRequest, `${location}.pullRequest`, errors);
  for (const [key, expected] of Object.entries({ baseSha: frozen.baseSha, headSha: frozen.headSha, treeSha: frozen.treeSha, validationRun: frozen.validationRun })) {
    pushIf(candidate[key] !== expected, `${location}.${key}:freeze-drift`, errors);
  }
}

export function validateEvent(event, policy) {
  const errors = [...validatePolicy(policy)];
  if (!exactKeys(event, ['schemaVersion', 'policyId', 'sequence', 'eventType', 'candidate', 'comment', 'previousEvent', 'actionBoundary'], '$event', errors)) return errors;
  pushIf(event.schemaVersion !== 1, '$event.schemaVersion', errors);
  pushIf(event.policyId !== policy.policyId, '$event.policyId', errors);
  pushIf(!Number.isInteger(event.sequence) || event.sequence < 1, '$event.sequence', errors);
  pushIf(!EVENT_TYPES.has(event.eventType), '$event.eventType', errors);
  validateCandidate(event.candidate, policy, '$event.candidate', errors);

  if (exactKeys(event.comment, ['id', 'url', 'author', 'authorAssociation', 'createdAt', 'updatedAt', 'bodySha256'], '$event.comment', errors)) {
    pushIf(!Number.isInteger(event.comment.id) || event.comment.id < 1, '$event.comment.id', errors);
    const urlPattern = new RegExp(`^https://github\\.com/Eskasia/governseed/(?:issues/${policy.scope.issue}|pull/${policy.scope.pullRequest})#issuecomment-${event.comment.id}$`, 'u');
    pushIf(typeof event.comment.url !== 'string' || !urlPattern.test(event.comment.url), '$event.comment.url', errors);
    pushIf(typeof event.comment.author !== 'string' || event.comment.author.length === 0, '$event.comment.author', errors);
    pushIf(typeof event.comment.authorAssociation !== 'string' || event.comment.authorAssociation.length === 0, '$event.comment.authorAssociation', errors);
    pushIf(!validTimestamp(event.comment.createdAt), '$event.comment.createdAt', errors);
    pushIf(!validTimestamp(event.comment.updatedAt), '$event.comment.updatedAt', errors);
    pushIf(!SHA256_PATTERN.test(event.comment.bodySha256), '$event.comment.bodySha256', errors);
    pushIf(policy.liveControlPlane.editsAllowed === false && event.comment.createdAt !== event.comment.updatedAt, '$event.comment:edited', errors);
  }
  if (event.previousEvent !== null && exactKeys(event.previousEvent, ['sequence', 'commentId', 'bodySha256'], '$event.previousEvent', errors)) {
    pushIf(!Number.isInteger(event.previousEvent.sequence) || event.previousEvent.sequence < 1, '$event.previousEvent.sequence', errors);
    pushIf(!Number.isInteger(event.previousEvent.commentId) || event.previousEvent.commentId < 1, '$event.previousEvent.commentId', errors);
    pushIf(!SHA256_PATTERN.test(event.previousEvent.bodySha256), '$event.previousEvent.bodySha256', errors);
  } else if (event.previousEvent !== null && !isObject(event.previousEvent)) {
    errors.push('$event.previousEvent:null-or-object-required');
  }
  if (exactKeys(event.actionBoundary, ['providerRequest', 'workflowDispatch', 'prReadiness', 'merge', 'formalLock', 'pilot', 'confirmatoryExecution', 'scoring', 'benchmarkAcceptance'], '$event.actionBoundary', errors)) {
    pushIf(!['NOT_RUN', 'ONE_AUTHORIZED_READ_ONLY_CHECKER'].includes(event.actionBoundary.providerRequest), '$event.actionBoundary.providerRequest', errors);
    for (const key of ['workflowDispatch', 'prReadiness', 'merge', 'formalLock', 'pilot', 'confirmatoryExecution', 'scoring', 'benchmarkAcceptance']) {
      pushIf(!['NOT_RUN', 'AUTHORIZED_AND_RUN'].includes(event.actionBoundary[key]), `$event.actionBoundary.${key}`, errors);
    }
    const expectedAction = EVENT_ACTION[event.eventType] ?? null;
    for (const [key, value] of Object.entries(event.actionBoundary)) {
      const expected = expectedAction?.[0] === key ? expectedAction[1] : 'NOT_RUN';
      pushIf(value !== expected, `$event.actionBoundary.${key}:event-mismatch`, errors);
    }
  }
  return errors;
}

export function verifyApiComment(event, apiComment) {
  const errors = [];
  if (!isObject(apiComment)) return ['$apiComment:object-required'];
  const required = ['id', 'html_url', 'user', 'author_association', 'created_at', 'updated_at', 'body'];
  for (const key of required) pushIf(!(key in apiComment), `$apiComment.${key}:missing`, errors);
  if (errors.length > 0) return errors;
  pushIf(event.comment.id !== apiComment.id, '$apiComment.id:mismatch', errors);
  pushIf(event.comment.url !== apiComment.html_url, '$apiComment.html_url:mismatch', errors);
  pushIf(event.comment.author !== apiComment.user?.login, '$apiComment.user.login:mismatch', errors);
  pushIf(event.comment.authorAssociation !== apiComment.author_association, '$apiComment.author_association:mismatch', errors);
  pushIf(event.comment.createdAt !== apiComment.created_at, '$apiComment.created_at:mismatch', errors);
  pushIf(event.comment.updatedAt !== apiComment.updated_at, '$apiComment.updated_at:mismatch', errors);
  if (typeof apiComment.body !== 'string') {
    errors.push('$apiComment.body:string-required');
  } else {
    pushIf(event.comment.bodySha256 !== sha256ExactUtf8(apiComment.body), '$apiComment.body:sha256-mismatch', errors);
  }
  return errors;
}

export function verifySequence(previousEvent, event, policy) {
  const errors = [];
  if (previousEvent === null) {
    pushIf(event.sequence !== 1, '$event.sequence:first-event-must-be-1', errors);
    pushIf(event.previousEvent !== null, '$event.previousEvent:first-event-must-be-null', errors);
    return errors;
  }
  pushIf(event.sequence !== previousEvent.sequence + 1, '$event.sequence:not-next', errors);
  if (!isObject(event.previousEvent)) {
    errors.push('$event.previousEvent:required');
    return errors;
  }
  pushIf(event.previousEvent.sequence !== previousEvent.sequence, '$event.previousEvent.sequence:mismatch', errors);
  pushIf(event.previousEvent.commentId !== previousEvent.comment.id, '$event.previousEvent.commentId:mismatch', errors);
  pushIf(event.previousEvent.bodySha256 !== previousEvent.comment.bodySha256, '$event.previousEvent.bodySha256:mismatch', errors);
  pushIf(Date.parse(event.comment.createdAt) < Date.parse(previousEvent.comment.createdAt), '$event.comment.createdAt:not-monotonic', errors);
  pushIf(policy.liveControlPlane.appendOnly !== true, '$policy.liveControlPlane.appendOnly', errors);
  return errors;
}

export function verifyBranch(policy, { observedHead, observedTree, changedPaths = [], branchRole = 'candidate' }) {
  const errors = [];
  pushIf(!BRANCH_ROLES.has(branchRole), '$branchRole', errors);
  pushIf(observedHead !== policy.candidateFreeze.headSha, '$observedHead:freeze-drift', errors);
  pushIf(observedTree !== policy.candidateFreeze.treeSha, '$observedTree:freeze-drift', errors);
  if (branchRole === 'candidate') {
    for (const changedPath of changedPaths) {
      const exact = policy.candidateBranch.forbiddenExactPaths.includes(changedPath);
      const prefix = policy.candidateBranch.forbiddenPathPrefixes.some((value) => changedPath.startsWith(value));
      pushIf(exact || prefix, `$changedPath:${changedPath}:candidate-control-write`, errors);
    }
  } else if (branchRole === 'control-checkpoint') {
    for (const changedPath of changedPaths) {
      pushIf(!policy.checkpoint.allowedPathPrefixes.some((value) => changedPath.startsWith(value)), `$changedPath:${changedPath}:outside-checkpoint-scope`, errors);
    }
  }
  return errors;
}

export function verifyControlPlane({ policy, event, apiComment, previousEvent = null, observedHead, observedTree, changedPaths = [], branchRole = 'candidate' }) {
  const validationErrors = [
    ...validateEvent(event, policy),
    ...(previousEvent === null ? [] : validateEvent(previousEvent, policy)),
  ];
  if (validationErrors.length > 0) return validationErrors;
  return [
    ...verifyApiComment(event, apiComment),
    ...verifySequence(previousEvent, event, policy),
    ...verifyBranch(policy, { observedHead, observedTree, changedPaths, branchRole }),
  ];
}
