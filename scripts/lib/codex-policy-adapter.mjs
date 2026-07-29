import {
  canonicalJsonBytes,
  sha256Bytes,
} from './governance-artifacts.mjs';

export const CODEX_POLICY_ADAPTER_VERSION = '1.0.0';

const SUPPORT = Object.freeze({
  'filesystem.project-read': 'representable-only',
  'filesystem.project-write': 'representable-only',
  'filesystem.root-write': 'representable-only',
  'shell.execution': 'requires-human-approval',
  network: 'representable-only',
  credentials: 'unsupported',
  delete: 'requires-human-approval',
  publish: 'requires-human-approval',
  'external-content': 'representable-only',
  'generated-artifacts': 'enforceable',
  'provider-retention': 'unsupported',
  verification: 'representable-only',
});

export function codexSupportForControl(capability, mode) {
  if (
    mode === 'deny'
    && ['delete', 'publish', 'shell.execution'].includes(capability)
  ) {
    return 'representable-only';
  }
  return SUPPORT[capability] ?? 'unsupported';
}

function mappedControls(manifest) {
  return Object.values(manifest.controls)
    .flat()
    .filter((control) => control.targetSupport.codex !== 'unsupported')
    .map((control) => ({
      controlId: control.controlId,
      capability: control.capability,
      mode: control.mode,
      support: control.targetSupport.codex,
      representation: control.targetSupport.codex === 'enforceable'
        ? 'compiler-owned-artifact'
        : control.targetSupport.codex === 'requires-human-approval'
          ? 'human-approval-guidance'
          : 'guidance',
    }))
    .sort((left, right) => (
      left.controlId < right.controlId
        ? -1
        : left.controlId > right.controlId
          ? 1
          : 0
    ));
}

export function buildCodexPolicyAdapter(manifest) {
  const policyPath =
    `.agent-governance/policies/${manifest.policyId}.json`;
  const adapterPath =
    `.agent-governance/adapters/codex/${manifest.policyId}.json`;
  return {
    schemaVersion: 1,
    target: 'codex',
    adapterVersion: CODEX_POLICY_ADAPTER_VERSION,
    policyId: manifest.policyId,
    policyHash: sha256Bytes(canonicalJsonBytes(manifest)),
    generatedFiles: [adapterPath, policyPath].sort(),
    mappedControls: mappedControls(manifest),
    unsupportedControls: structuredClone(manifest.unsupportedControls),
    humanReviewRequired: [...manifest.humanApprovalControls].sort(),
    compatibility: {
      projectInstructions: 'AGENTS.md',
      projectConfigGenerated: false,
      runtimeEvidenceRequired: true,
      notes: [
        'AGENTS.md remains the canonical repository instruction owner.',
        'No .codex/config.toml or runtime sandbox setting is generated.',
        'Project trust, configuration precedence, and runtime behavior require separate evidence.',
      ],
    },
    repositoryInstructionRefs: ['AGENTS.md'],
    approvalGuidance: [
      'A denied action remains denied and cannot be enabled by approval.',
      'For publish, destructive, or shell actions, require explicit human approval only when the canonical control mode requires approval.',
      'Treat approval guidance as a decision gate, not evidence of runtime enforcement.',
    ],
    verificationCommands: [],
    prohibitedActionGuidance: [
      'Do not read credentials or provider sessions.',
      'Do not write user-global Codex configuration.',
      'Do not treat this adapter as an OS sandbox or runtime attestation.',
      'Do not infer a verification command that is absent from governed project inputs.',
    ],
    ownership: {
      generator: 'GovernSeed',
      artifactType: 'codex-policy-adapter',
    },
    status: 'candidate',
  };
}
