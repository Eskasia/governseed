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

const CODEX = Object.freeze({
  name: 'codex',
  adapterVersion: '1.0.0',
  // Kept target-specific rather than generalized to a shared code: the string
  // is part of the compiled artifact, and the codex bytes must not change.
  unsupportedReasonCode: 'CODEX_CONTROL_NOT_ENFORCEABLE',
  adapterSchema: 'codex-policy-adapter.schema.json',
  supportsMaterialization: true,
});

const TARGETS = Object.freeze({ codex: CODEX });

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
