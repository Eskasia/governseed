/**
 * The single place that knows which targets exist and what is target-specific
 * about each one.
 *
 * Before this registry, `codex` was written as a literal in the compiler core,
 * the CLI, and the adapter schema. Adding a second target meant finding every
 * one of those sites. A target is now a record, and the sites read from it.
 *
 * Registration is not a claim of support. `compile` support is what this file
 * declares; `materialize` and `attest` require a materializer, which only some
 * targets have. `supportsMaterialization` is that distinction, and it is the
 * reason a target can be compilable without being materializable.
 */

/**
 * The one claim every target-materialized artifact makes, and the ceiling on
 * what any of them may claim. It lives here rather than in a materializer
 * because both materializers and the attestation builder assert it, and a
 * second copy of this string is a second place it could drift.
 */
export const ATTEST_CLAIM = 'PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED';

const CODEX = Object.freeze({
  name: 'codex',
  adapterVersion: '1.0.0',
  // Kept target-specific rather than generalized to a shared code: the string
  // is part of the compiled artifact, and the codex bytes must not change.
  unsupportedReasonCode: 'CODEX_CONTROL_NOT_ENFORCEABLE',
  adapterSchema: 'codex-policy-adapter.schema.json',
  adapterArtifactType: 'codex-policy-adapter',
  // Reason codes are an observable reporting surface, so each target names its
  // own rather than sharing a generic one. The codex codes predate the registry
  // and keep their published spelling.
  adapterInvalidCode: 'CODEX_ADAPTER_INVALID',
  adapterOwnerConflictCode: 'CODEX_ADAPTER_OWNER_CONFLICT',
  supportsMaterialization: true,
  // The one project-local file this target's materializer may write. The
  // receipt validator needs it to reject a receipt that names any other path,
  // which is the check that keeps a materializer inside its own boundary.
  targetPath: '.codex/config.toml',
});

const CLAUDE = Object.freeze({
  name: 'claude',
  adapterVersion: '1.0.0',
  unsupportedReasonCode: 'CLAUDE_CONTROL_NOT_ENFORCEABLE',
  adapterSchema: 'claude-policy-adapter.schema.json',
  adapterArtifactType: 'claude-policy-adapter',
  adapterInvalidCode: 'CLAUDE_ADAPTER_INVALID',
  adapterOwnerConflictCode: 'CLAUDE_ADAPTER_OWNER_CONFLICT',
  supportsMaterialization: true,
  targetPath: '.claude/settings.json',
});

const TARGETS = Object.freeze({ claude: CLAUDE, codex: CODEX });

/**
 * Adapter output is partitioned by target so two targets compiled in the same
 * project never contend for one path. Derived here rather than written at each
 * call site, because the compile receipt, the adapter's own generatedFiles, and
 * the doctor's scan all have to agree on it.
 */
export function adapterPathFor(target, policyId) {
  return `.agent-governance/adapters/${target}/${policyId}.json`;
}

export const REGISTERED_TARGETS = Object.freeze(Object.keys(TARGETS).sort());

export const MATERIALIZABLE_TARGETS = Object.freeze(
  REGISTERED_TARGETS.filter((name) => TARGETS[name].supportsMaterialization),
);

export function isRegisteredTarget(name) {
  return typeof name === 'string'
    && Object.prototype.hasOwnProperty.call(TARGETS, name);
}

export function supportsMaterialization(name) {
  return isRegisteredTarget(name) && TARGETS[name].supportsMaterialization;
}

export function targetDefinition(name) {
  if (!isRegisteredTarget(name)) return null;
  return TARGETS[name];
}
