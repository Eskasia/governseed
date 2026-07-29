import path from 'node:path';

import {
  canonicalJsonBytes,
  sha256Canonical,
} from './governance-artifacts.mjs';
import {
  selectResponsibilities,
} from './decision-role-core.mjs';

export const POLICY_COMPILER_VERSION = '1.0.0';
export const POLICY_MODE_ORDER = Object.freeze([
  'deny',
  'require-approval',
  'constrained-allow',
  'allow',
  'advisory',
]);

const MODE_RANK = new Map(
  POLICY_MODE_ORDER.map((mode, index) => [mode, index]),
);
const PORTABLE_SEGMENT = /^[A-Za-z0-9._@+-]+$/u;
const WINDOWS_RESERVED_SEGMENT =
  /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu;
const CAPABILITY_CATEGORY = Object.freeze({
  'filesystem.project-read': 'filesystem',
  'filesystem.project-write': 'filesystem',
  'filesystem.root-write': 'filesystem',
  network: 'network',
  credentials: 'credentials',
  delete: 'destructiveActions',
  publish: 'publishActions',
});
const CONTROL_IDS = Object.freeze({
  'filesystem.project-read': 'POL-FILESYSTEM-PROJECT-READ',
  'filesystem.project-write': 'POL-FILESYSTEM-PROJECT-WRITE',
  'filesystem.root-write': 'POL-FILESYSTEM-ROOT-WRITE',
  network: 'POL-NETWORK',
  credentials: 'POL-CREDENTIALS',
  delete: 'POL-DESTRUCTIVE-ACTIONS',
  publish: 'POL-PUBLISH-ACTIONS',
  'shell.execution': 'POL-SHELL-EXECUTION',
  'external-content': 'POL-EXTERNAL-CONTENT',
  'generated-artifacts': 'POL-GENERATED-ARTIFACTS',
  'provider-retention': 'POL-RETENTION',
  verification: 'POL-VERIFICATION',
});
const FIXED_CONTROL_DEFAULTS = Object.freeze({
  'shell.execution': 'require-approval',
  'generated-artifacts': 'constrained-allow',
  'provider-retention': 'advisory',
  verification: 'require-approval',
});

export class PolicyCompilerError extends Error {
  constructor(code, subject = 'policy-compiler') {
    super(code);
    this.name = 'PolicyCompilerError';
    this.code = code;
    this.subject = subject;
  }
}

function fail(code, subject) {
  throw new PolicyCompilerError(code, subject);
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => {
    const leftText = String(left);
    const rightText = String(right);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
}

function sortedObjects(values, key) {
  return [...values].sort((left, right) => {
    const leftText = String(left[key]);
    const rightText = String(right[key]);
    return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
  });
}

function packCheckRequirements(pack) {
  const requirements = [
    ...(pack.mechanicalChecks ?? []).map((check) => ({
      checkId: check.checkId,
      kind: 'mechanical',
    })),
    ...(pack.humanReviewChecks ?? []).map((check) => ({
      checkId: check.checkId,
      kind: 'human-review',
    })),
  ].map((requirement) => ({
    ...requirement,
    evidenceRef: `EVD-PACK-${sha256Canonical({
      packId: pack.packId,
      version: pack.version,
      ...requirement,
    }).slice(0, 16).toUpperCase()}`,
  }));
  return requirements.sort((left, right) => (
    left.kind < right.kind
      ? -1
      : left.kind > right.kind
        ? 1
        : left.checkId < right.checkId
          ? -1
          : left.checkId > right.checkId
            ? 1
            : 0
  ));
}

export function normalizePortablePath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^~[\\/]/u.test(value)
  ) {
    fail('COMPILE_PATH_BLOCKED');
  }
  const segments = value.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => (
    segment === '..'
    || (
      segment !== ''
      && segment !== '.'
      && (
        !PORTABLE_SEGMENT.test(segment)
        || WINDOWS_RESERVED_SEGMENT.test(segment)
        || segment.endsWith('.')
      )
    )
  ))) {
    fail('COMPILE_PATH_BLOCKED');
  }
  const normalized = segments
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  if (normalized === '') fail('COMPILE_PATH_BLOCKED');
  return normalized;
}

function assertNoPortablePathCollisions(entries) {
  const seen = new Map();
  for (const entry of entries) {
    const folded = entry.path.toLowerCase();
    const prior = seen.get(folded);
    if (prior !== undefined && prior !== entry.path) {
      fail('POLICY_CONFLICT');
    }
    seen.set(folded, entry.path);
  }
}

export function normalizePolicyMode(value) {
  const normalized = value === 'require-human-approval'
    ? 'require-approval'
    : value;
  if (!MODE_RANK.has(normalized)) {
    fail('POLICY_MANIFEST_INVALID');
  }
  return normalized;
}

export function mostRestrictivePolicyMode(values) {
  const modes = values.map(normalizePolicyMode);
  if (modes.length === 0) fail('POLICY_MANIFEST_INVALID');
  return [...modes].sort((left, right) => (
    MODE_RANK.get(left) - MODE_RANK.get(right)
  ))[0];
}

function leastRestrictivePolicyMode(values) {
  const modes = values.map(normalizePolicyMode);
  if (modes.length === 0) fail('POLICY_MANIFEST_INVALID');
  return [...modes].sort((left, right) => (
    MODE_RANK.get(right) - MODE_RANK.get(left)
  ))[0];
}

function isWider(candidate, ceiling) {
  return MODE_RANK.get(normalizePolicyMode(candidate))
    > MODE_RANK.get(normalizePolicyMode(ceiling));
}

function rootCapability(capability) {
  if (capability.startsWith('network.')) return 'network';
  if (capability.startsWith('credentials.')) return 'credentials';
  return capability;
}

function assertRiskReady(profile) {
  if (
    !profile
    || profile.status !== 'assessed'
    || !Array.isArray(profile.tasks)
    || profile.tasks.filter((task) => task.status === 'active').length === 0
    || (profile.openQuestions?.length ?? 0) > 0
  ) {
    fail('POLICY_INPUT_MISSING', profile?.profileId ?? 'risk-profile');
  }
  for (const task of profile.tasks.filter((item) => item.status === 'active')) {
    if (
      !['low', 'medium', 'high'].includes(task.riskLevel)
      || typeof task.needsDeliberation !== 'boolean'
      || !Array.isArray(task.reasonCodes)
      || task.reasonCodes.length === 0
    ) {
      fail('POLICY_INPUT_MISSING', task.taskId);
    }
  }
}

function assertAssignmentBounded(
  assignment,
  riskCeiling,
  task,
  knownTaskIds,
) {
  const taskCapabilities = new Set(
    (task.requestedCapabilities ?? []).map(rootCapability),
  );
  for (const [capability, riskMode] of Object.entries(riskCeiling)) {
    const assignmentMode = assignment.permissionCeiling?.[capability];
    if (assignmentMode === undefined || isWider(assignmentMode, riskMode)) {
      fail('POLICY_PRIVILEGE_EXPANSION', assignment.assignmentId);
    }
  }
  for (const role of assignment.selectedRoles ?? []) {
    if (
      role.assignedTaskScope?.length !== 1
      || role.assignedTaskScope[0] !== task.taskId
      || !knownTaskIds.has(role.assignedTaskScope[0])
    ) {
      fail('POLICY_PRIVILEGE_EXPANSION', assignment.assignmentId);
    }
    const allowedRequests = new Set(taskCapabilities);
    if (role.responsibility !== 'implementation-owner') {
      allowedRequests.add('filesystem.project-read');
    }
    for (const [capability, riskMode] of Object.entries(riskCeiling)) {
      const grant = role.grantedCapabilityCeiling?.[capability];
      if (
        grant === undefined
        || isWider(grant, riskMode)
        || isWider(grant, assignment.permissionCeiling[capability])
      ) {
        fail('POLICY_PRIVILEGE_EXPANSION', assignment.assignmentId);
      }
    }
    for (const requested of role.requestedCapabilities ?? []) {
      const capability = rootCapability(requested);
      if (
        !allowedRequests.has(capability)
        ||
        !Object.hasOwn(riskCeiling, capability)
        || isWider(
          role.grantedCapabilityCeiling[capability],
          riskCeiling[capability],
        )
      ) {
        fail('POLICY_PRIVILEGE_EXPANSION', assignment.assignmentId);
      }
    }
  }
  const selectedRoles = assignment.selectedRoles ?? [];
  const selectedByResponsibility = new Map(
    selectedRoles.map((role) => [role.responsibility, role]),
  );
  const requiredResponsibilities =
    selectResponsibilities(task).responsibilities;
  const implementation =
    selectedByResponsibility.get('implementation-owner');
  const finalVerifier = selectedRoles.find(
    (role) => (
      role.specialistRoleId
      === assignment.separationOfDuties?.finalVerifier
      && role.responsibility !== 'implementation-owner'
    ),
  );
  const separationRequired =
    task.riskLevel === 'high' || selectedRoles.length > 1;
  if (
    requiredResponsibilities.some(
      (responsibility) => !selectedByResponsibility.has(responsibility),
    )
    || !implementation
    || (
      separationRequired
      && (
        assignment.separationOfDuties?.required !== true
        || assignment.separationOfDuties.implementationOwner
          !== implementation.specialistRoleId
        || implementation.cannotApprove !== true
        || !finalVerifier
      )
    )
  ) {
    fail('POLICY_PRIVILEGE_EXPANSION', assignment.assignmentId);
  }
}

function activeAssignments(input) {
  const activeTasks = input.riskProfile.tasks.filter(
    (task) => task.status === 'active',
  );
  const assignments = new Map(
    input.roleAssignments.map((entry) => [entry.value.taskId, entry]),
  );
  const selected = [];
  const knownTaskIds = new Set(
    input.riskProfile.tasks.map((task) => task.taskId),
  );
  for (const task of activeTasks) {
    const entry = assignments.get(task.taskId);
    if (!entry || entry.value.status !== 'assigned') {
      fail('POLICY_INPUT_MISSING', task.taskId);
    }
    assertAssignmentBounded(
      entry.value,
      input.riskProfile.permissionCeiling,
      task,
      knownTaskIds,
    );
    selected.push(entry);
  }
  return selected;
}

function effectiveModes(input, assignments) {
  const modes = Object.fromEntries(
    [
      ...Object.entries(input.riskProfile.permissionCeiling),
      ...Object.entries(FIXED_CONTROL_DEFAULTS),
    ].map(
      ([capability, mode]) => [capability, normalizePolicyMode(mode)],
    ),
  );
  const sources = Object.fromEntries(
    Object.keys(modes).map((capability) => [
      capability,
      Object.hasOwn(input.riskProfile.permissionCeiling, capability)
        ? [`risk-profile:${input.riskProfile.profileId}`]
        : [`governance-rules:${input.governanceRuleRef.path}`],
    ]),
  );
  const reasonCodes = Object.fromEntries(
    Object.keys(modes).map((capability) => [
      capability,
      Object.hasOwn(input.riskProfile.permissionCeiling, capability)
        ? ['POLICY_RISK_CEILING']
        : ['POLICY_TARGET_DEFAULT'],
    ]),
  );
  const scopes = Object.fromEntries(
    Object.keys(modes).map((capability) => [capability, null]),
  );

  for (const { value: assignment } of assignments) {
    for (const capability of Object.keys(
      input.riskProfile.permissionCeiling,
    )) {
      const requestingRoles = (assignment.selectedRoles ?? []).filter(
        (role) => (role.requestedCapabilities ?? []).some(
          (requested) => rootCapability(requested) === capability,
        ),
      );
      const requestedGrant = requestingRoles.length === 0
        ? 'deny'
        : leastRestrictivePolicyMode(
          requestingRoles.map(
            (role) => role.grantedCapabilityCeiling[capability],
          ),
        );
      modes[capability] = mostRestrictivePolicyMode([
        modes[capability],
        assignment.permissionCeiling[capability],
        requestedGrant,
      ]);
      sources[capability].push(
        `role-assignment:${assignment.assignmentId}@${assignment.revision}`,
      );
      reasonCodes[capability].push(
        'POLICY_ROLE_CEILING',
        'POLICY_ROLE_REQUEST_INTERSECTION',
      );
    }
  }

  modes['external-content'] = modes.network;
  sources['external-content'] = [...sources.network];
  reasonCodes['external-content'] = [
    ...reasonCodes.network,
    'POLICY_EXTERNAL_CONTENT_BOUNDARY',
  ];

  const packControlIds = new Set();
  const canonicalControlIds = new Set(Object.values(CONTROL_IDS));
  for (const entry of input.enabledPacks) {
    const pack = entry.value;
    if (pack.status !== 'active') continue;
    for (const control of pack.controls ?? []) {
      if (
        control.scope !== 'all'
        && !input.riskProfile.tasks.some(
          (task) => task.taskId === control.scope,
        )
      ) {
        fail('POLICY_CONFLICT', pack.packId);
      }
      const applies = control.scope === 'all'
        || input.riskProfile.tasks.some(
          (task) => task.status === 'active' && task.taskId === control.scope,
        );
      if (!applies) continue;
      const capability = rootCapability(control.capability);
      const source = `pack:${pack.packId}@${pack.version}`;
      if (!Object.hasOwn(modes, capability)) {
        fail('POLICY_PRIVILEGE_EXPANSION', pack.packId);
      }
      if (
        canonicalControlIds.has(control.controlId)
        || packControlIds.has(control.controlId)
      ) {
        fail('POLICY_CONFLICT', pack.packId);
      }
      packControlIds.add(control.controlId);
      if (isWider(control.effect, modes[capability])) {
        fail('POLICY_PRIVILEGE_EXPANSION', pack.packId);
      }
      if (
        control.scope !== 'all'
        && input.riskProfile.tasks.filter(
          (task) => task.status === 'active',
        ).length !== 1
      ) {
        fail('POLICY_CONFLICT', pack.packId);
      }
      modes[capability] = mostRestrictivePolicyMode([
        modes[capability],
        control.effect,
      ]);
      sources[capability].push(source);
      reasonCodes[capability].push('POLICY_PACK_CONSTRAINT');
      if (control.scope !== 'all') {
        scopes[capability] = [control.scope];
      }
    }
  }

  modes['external-content'] = mostRestrictivePolicyMode([
    modes.network,
    modes['external-content'],
  ]);
  sources['external-content'] = sortedUnique([
    ...sources.network,
    ...sources['external-content'],
  ]);
  reasonCodes['external-content'] = sortedUnique([
    ...reasonCodes.network,
    ...reasonCodes['external-content'],
    'POLICY_EXTERNAL_CONTENT_BOUNDARY',
  ]);
  const externalScopes = sortedUnique([
    ...(scopes.network ?? []),
    ...(scopes['external-content'] ?? []),
  ]);
  scopes['external-content'] =
    externalScopes.length > 0 ? externalScopes : null;

  return { modes, sources, reasonCodes, scopes };
}

function makeControl({
  capability,
  mode,
  source,
  reasonCodes,
  scope,
  evidenceRequirement,
  supportForControl,
  controlId = CONTROL_IDS[capability],
}) {
  const support = supportForControl(capability, mode);
  return {
    controlId,
    capability,
    mode: normalizePolicyMode(mode),
    source: sortedUnique(source),
    reasonCodes: sortedUnique(reasonCodes),
    scope: sortedUnique(scope),
    targetSupport: { codex: support },
    evidenceRequirement: sortedUnique(evidenceRequirement),
  };
}

function buildControls(
  input,
  effective,
  supportForControl,
  evidenceRequirements,
) {
  const controls = {
    filesystem: [],
    shell: [],
    network: [],
    credentials: [],
    destructiveActions: [],
    publishActions: [],
    externalContent: [],
    generatedArtifacts: [],
    retention: [],
    verification: [],
  };

  for (const capability of Object.keys(CAPABILITY_CATEGORY).sort()) {
    const category = CAPABILITY_CATEGORY[capability];
    const scope = effective.scopes[capability]
      ?? (
        capability === 'filesystem.root-write'
          ? ['outside-project']
          : capability.startsWith('filesystem.')
            ? ['project-local']
            : ['all-active-tasks']
      );
    controls[category].push(makeControl({
      capability,
      mode: effective.modes[capability],
      source: effective.sources[capability],
      reasonCodes: effective.reasonCodes[capability],
      scope,
      evidenceRequirement: evidenceRequirements,
      supportForControl,
    }));
  }

  controls.shell.push(makeControl({
    capability: 'shell.execution',
    mode: effective.modes['shell.execution'],
    source: effective.sources['shell.execution'],
    reasonCodes: effective.reasonCodes['shell.execution'],
    scope: effective.scopes['shell.execution'] ?? ['project-local'],
    evidenceRequirement: evidenceRequirements,
    supportForControl,
  }));
  controls.externalContent.push(makeControl({
    capability: 'external-content',
    mode: effective.modes['external-content'],
    source: effective.sources['external-content'],
    reasonCodes: effective.reasonCodes['external-content'],
    scope:
      effective.scopes['external-content'] ?? ['network-derived-content'],
    evidenceRequirement: evidenceRequirements,
    supportForControl,
  }));
  controls.generatedArtifacts.push(makeControl({
    capability: 'generated-artifacts',
    mode: effective.modes['generated-artifacts'],
    source: effective.sources['generated-artifacts'],
    reasonCodes: [
      ...effective.reasonCodes['generated-artifacts'],
      'POLICY_GENERATED_OWNER_REQUIRED',
    ],
    scope:
      effective.scopes['generated-artifacts'] ?? ['.agent-governance'],
    evidenceRequirement: evidenceRequirements,
    supportForControl,
  }));
  controls.retention.push(makeControl({
    capability: 'provider-retention',
    mode: effective.modes['provider-retention'],
    source: effective.sources['provider-retention'],
    reasonCodes: [
      ...effective.reasonCodes['provider-retention'],
      'POLICY_PROVIDER_RETENTION_UNOBSERVED',
    ],
    scope:
      effective.scopes['provider-retention'] ?? ['provider-runtime'],
    evidenceRequirement: evidenceRequirements,
    supportForControl,
  }));
  controls.verification.push(makeControl({
    capability: 'verification',
    mode: effective.modes.verification,
    source: effective.sources.verification,
    reasonCodes: [
      ...effective.reasonCodes.verification,
      'POLICY_EVIDENCE_REQUIRED',
    ],
    scope: effective.scopes.verification ?? ['all-active-tasks'],
    evidenceRequirement: evidenceRequirements,
    supportForControl,
  }));

  for (const category of Object.keys(controls)) {
    controls[category] = sortedObjects(controls[category], 'controlId');
  }
  return controls;
}

function flatControls(controls) {
  return Object.values(controls).flat();
}

function manifestId(seed) {
  return `POL-${sha256Canonical(seed).slice(0, 12).toUpperCase()}`;
}

export function buildPolicyManifest(input, options) {
  assertRiskReady(input.riskProfile);
  if (
    options?.target !== 'codex'
    || typeof options?.supportForControl !== 'function'
  ) {
    fail('POLICY_MANIFEST_INVALID');
  }
  const governanceRulePath = normalizePortablePath(
    input.governanceRuleRef.path,
  );
  const normalizedInput = {
    ...input,
    governanceRuleRef: {
      ...input.governanceRuleRef,
      path: governanceRulePath,
    },
    inputHashes: sortedObjects(
      input.inputHashes.map((entry) => ({
        ...entry,
        path: normalizePortablePath(entry.path),
      })),
      'path',
    ),
    roleAssignments: sortedObjects(
      input.roleAssignments.map((entry) => ({
        ...entry,
        path: normalizePortablePath(entry.path),
      })),
      'path',
    ),
    enabledPacks: sortedObjects(
      input.enabledPacks.map((entry) => ({
        ...entry,
        path: normalizePortablePath(entry.path),
      })),
      'path',
    ),
  };
  assertNoPortablePathCollisions(normalizedInput.inputHashes);
  const assignments = activeAssignments(normalizedInput);
  const effective = effectiveModes(normalizedInput, assignments);
  const evidenceRequirements = sortedUnique(
    [
      ...normalizedInput.riskProfile.tasks
        .filter((task) => task.status === 'active')
        .flatMap((task) => task.requiredEvidence ?? []),
      ...normalizedInput.enabledPacks
        .filter((entry) => entry.value.status === 'active')
        .flatMap((entry) => (
          packCheckRequirements(entry.value)
            .map((requirement) => requirement.evidenceRef)
        )),
    ],
  );
  const controls = buildControls(
    normalizedInput,
    effective,
    options.supportForControl,
    evidenceRequirements,
  );
  const flattened = flatControls(controls);
  const unsupportedControls = flattened
    .filter((control) => control.targetSupport.codex === 'unsupported')
    .map((control) => ({
      controlId: control.controlId,
      capability: control.capability,
      target: 'codex',
      support: 'unsupported',
      reasonCode: 'CODEX_CONTROL_NOT_ENFORCEABLE',
    }));
  const humanApprovalControls = sortedUnique(
    flattened
      .filter((control) => (
        control.mode === 'require-approval'
        || (
          control.mode !== 'deny'
          && control.targetSupport.codex === 'requires-human-approval'
        )
      ))
      .map((control) => control.controlId),
  );
  const sourceRefs = sortedUnique([
    ...normalizedInput.riskProfile.sourceRefs,
    ...normalizedInput.activeDecisionRefs.map(
      (entry) => `${entry.decisionId}@${entry.revision}`,
    ),
    ...assignments.flatMap((entry) => entry.value.sourceRefs ?? []),
    ...normalizedInput.enabledPacks.map(
      (entry) => `PACK:${entry.value.packId}@${entry.value.version}`,
    ),
  ]);
  const roleAssignmentRefs = assignments.map((entry) => ({
    assignmentId: entry.value.assignmentId,
    taskId: entry.value.taskId,
    revision: entry.value.revision,
    path: entry.path,
    sha256: entry.sha256,
  }));
  const enabledPacks = normalizedInput.enabledPacks.map((entry) => ({
    packId: entry.value.packId,
    version: entry.value.version,
    path: entry.path,
    sha256: entry.sha256,
    sourceRef: entry.value.source.sourceId,
    mechanicalCheckIds: sortedUnique(
      (entry.value.mechanicalChecks ?? []).map((check) => check.checkId),
    ),
    humanReviewCheckIds: sortedUnique(
      (entry.value.humanReviewChecks ?? []).map((check) => check.checkId),
    ),
    checkRequirements: packCheckRequirements(entry.value),
  }));
  const seed = {
    schemaVersion: 1,
    revision: 1,
    projectId: normalizedInput.projectId,
    generatedAt: null,
    compilerVersion: POLICY_COMPILER_VERSION,
    inputHashes: normalizedInput.inputHashes,
    riskProfileRef: {
      ...normalizedInput.riskProfileRef,
      path: normalizePortablePath(normalizedInput.riskProfileRef.path),
    },
    sourceRefs,
    roleAssignmentRefs,
    enabledPacks,
    controls,
    targets: [
      {
        target: 'codex',
        adapterVersion: '1.0.0',
        status: 'candidate',
      },
    ],
    unsupportedControls,
    humanApprovalControls,
    evidenceRequirements,
    ownership: {
      generator: 'GovernSeed',
      artifactType: 'policy-manifest',
    },
    status: 'candidate',
  };
  return {
    ...seed,
    policyId: manifestId(seed),
  };
}

export function canonicalPolicyBytes(value) {
  return canonicalJsonBytes(value);
}
