# GovernSeed Validation

## Starter Consistency Check

Validates the starter repo itself: root entrypoints, public docs, prompt library, cross-references, CLI flags, CI smoke path, and example fixtures.

```bash
node scripts/validate-starter.mjs .
```

Expected: `Starter validation passed.`

In a Git checkout, required release artifacts must already exist in and match `HEAD`. Untracked, index-only, staged, and unstaged release-unit changes fail the committed-artifact gate, so run release validation again from the reviewed commit.

## Project Doctor

Validates a project initialized from the starter: fixed documents, content quality, and conditional document hints.

```bash
node scripts/doctor.mjs /path/to/your/project
```

For filled fixtures or release checks, use strict mode:

```bash
node scripts/doctor.mjs --strict /path/to/your/project
```

Strict mode treats missing documents and blocking warnings as failures. Honest
Policy Compiler limitation codes such as `POLICY_UNSUPPORTED_CONTROL` and
`CODEX_CONTROL_NOT_ENFORCEABLE` remain advisory in strict mode. Normal mode
allows placeholder warnings so a freshly initialized project can still be
inspected.

## Decision And Role Foundation

Run the deterministic Milestone 1 contract suite with:

```bash
npm run test:decision-role
```

It covers the seven public artifact schemas, the separate CLI-output schema,
exact JSON parsing, UTF-8 and size limits, path traversal and symlink defenses,
hard-link rejection, secret and private-content blocking, deterministic assess/plan/import/assign
behavior, no-plan handling for untriggered decisions, graph replay mismatch,
explicit human-confirmation state transition, enabled-Pack permission
intersection, stable doctor finding codes, legacy compatibility, and no
network or user-global writes.

The six named fixture projects are:

- `low-risk-docs-task`
- `architecture-decision`
- `restricted-publish-task`
- `malicious-role-catalog`
- `replay-version-mismatch`
- `privacy-negative`

Useful direct checks:

```bash
node --test tests/decision-role/artifact-safety.test.mjs
node --test tests/decision-role/schema-contracts.test.mjs
node --test tests/decision-role/cli-contracts.test.mjs
node --test tests/decision-role/doctor-contracts.test.mjs
npm run fixtures
```

Decision-role fixture directories are bounded governance-artifact overlays, not
standalone initialized projects. The doctor contract suite applies each
scenario to the filled `base-minimal` project before normal and strict checks;
`npm run fixtures` continues to run every existing standalone strict fixture.

All `agent-governance --json` commands must emit exactly one closed JSON object
to stdout; progress and diagnostics belong on stderr. The documented exit codes
are `0` success, `1` incomplete governed input, `2` usage error, `3` schema or
semantic validation failure, `4` a fail-closed safety/policy/reference block,
and `5` bounded project-local I/O failure.

## Risk-to-Policy Compiler

Run the deterministic Phase 2 suite with:

```bash
npm run test:policy-compiler
```

It covers the three closed compiler Schemas, most-restrictive policy merge,
role/Pack non-expansion, canonical hashes and byte stability, Codex
representable/unsupported controls, dry-run non-mutation, receipt-last atomic
writes, owner conflicts, stale/drift/partial doctor findings, traversal,
symlink/hardlink and parent-swap defenses, UTF-8/CRLF and 1 MiB limits, secret
blocking, ignored-local exclusion, Pack evidence obligations and task-scope
fail-closed behavior, final pre-receipt output revalidation, isolated
user-global state, valid proposed/active decision handling, external role
catalog provenance plus responsibility/surface/capability compatibility,
normalized OAuth secret-bearing URL key rejection, malformed-assignment
classification, JSON output, and stable exit codes.

The eight executable fixture contracts are:

- `low-risk-codex`
- `restricted-data-codex`
- `publish-approval-codex`
- `malicious-pack-expansion`
- `owner-conflict`
- `stale-policy`
- `dry-run`
- `cross-platform-paths`

`cross-platform-paths` pins the expected policy ID plus manifest and Adapter
SHA-256 values. Ubuntu, macOS, and Windows therefore compare the same canonical
bytes rather than merely passing independent path-normalization checks.

Direct checks:

```bash
node --test tests/policy-compiler/artifact-safety.test.mjs
node --test tests/policy-compiler/cli-contracts.test.mjs
node --test tests/policy-compiler/core.test.mjs
node --test tests/policy-compiler/doctor-contracts.test.mjs
node --test tests/policy-compiler/fixture-contracts.test.mjs
node --test tests/policy-compiler/schema-contracts.test.mjs
```

Compile creates only:

```text
.agent-governance/policies/<policy-id>.json
.agent-governance/adapters/codex/<policy-id>.json
.agent-governance/receipts/<compile-id>.json
```

The Adapter is JSON guidance, not Codex runtime configuration or a sandbox.
The receipt proves local transaction completion, not enforcement or
Attestation.

Phase 2 does not import or verify approval evidence. Active publish or delete
work that requires approval remains a strict doctor failure even after
compilation.

## Init Smoke Checks

```bash
npm run smoke:base
npm run smoke:fullstack
```

## Template Adoption Fixtures

The starter keeps filled example project packs under `examples/template-adoption/`.

| Fixture | What it validates | Strict check |
|---|---|---|
| `base-minimal` | Fixed docs plus base profile expected doctor JSON | `node scripts/doctor.mjs --strict examples/template-adoption/base-minimal` |
| `fullstack-ai-saas` | Fixed docs plus RAG, eval, and AI security templates | `node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas` |
| `macos-beta-handoff` | Fixed docs plus macOS release and tester handoff templates | `node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff` |

These fixtures are not production projects. They are local adoption proofs that required templates can be filled coherently across different project types.

Expected doctor JSON is checked with:

```bash
npm run fixtures
```

## Governance Impact Evaluation

Governance-impact evaluation is separate from runtime proof. It compares baseline and governed delivery artifacts after intake is complete; it does not evaluate Q1-Q9 interview quality.

Public/offline validation requires no credentials, network, or real agent CLI:

```bash
npm run test:governance
npm run test:governance-impact
npm run test:privacy
npm run validate:governance-impact
npm run eval:governance
```

`npm run eval:governance` runs only the committed baseline-win, governed-win, tie, missing-telemetry, and forbidden-change controls. It does not launch an agent or support an effectiveness claim.

Real paired evaluation is a separate, explicit synthetic-only maintainer action:

```bash
GOVERNANCE_IMPACT_REAL=1 node scripts/governance-impact-eval.mjs run \
  --scenario tests/governance-impact/scenarios/scope-guard \
  --manifest evidence/manifest.json \
  --policy evidence/policy.json \
  --attempt-id "$ATTEMPT_ID" \
  --output evidence/paired-run.json
```

`ATTEMPT_ID` must be the exact preregistered 64-character lowercase hexadecimal ID. Do not run that command until the scenario is committed and clean, its hashes and manifest/policy pins are preregistered, the selected adapter passes its fail-closed capability checks, and the output path does not exist. The shipped Codex evaluator refuses before launch with `SESSION_SAFETY_UNAVAILABLE` because detached or re-parented descendant containment is not proven; Claude and Antigravity evaluator runs also remain fail-closed.

See `docs/governance-impact-eval.md` for the exact CLI, privacy/cleanup boundary, comparability rules, exit codes, claim thresholds, and non-claims.

## CI

GitHub Actions entrypoint:

```text
.github/workflows/validate-starter.yml
```

The workflow runs on Ubuntu, macOS, and Windows:

```bash
npm run ci
```

Windows runs the portable offline contracts and the relay through a native named
pipe. Tests that require a Unix-domain socket, POSIX uid/mode enforcement, or a
Linux OCI execution surface report an explicit platform skip; they do not count
as Windows containment evidence. Ubuntu and macOS retain those offline test
surfaces, and only Linux is eligible for the separately gated real Scheme A
workflow.

Runtime proof has a separate manual workflow:

```text
.github/workflows/runtime-proof.yml
```

Public CI runs without secrets. Runtime proof defaults to mock mode, while real runtime proof is opt-in:

```bash
npm run runtime:proof
RUNTIME_PROOF_REAL=1 npm run runtime:proof
```

`RUNTIME_PROOF_REAL=1` is synthetic-only and fails closed when a required CLI or safety capability is unavailable. It does not imply that the separate governance-impact evaluator supports the same runtime.

`npm run ci` includes all deterministic governance and governance-impact checks and must never set `GOVERNANCE_IMPACT_REAL`.

Before a release review, also run:

```bash
npm pack --dry-run --json
git diff --check
```

The package dry-run must list the umbrella CLI, both legacy binaries, all three
compiler modules and doctor integration, the three compiler Schemas, compiler
docs/tests/eight fixtures, the built-in responsibility catalog, and third-party
notices without `.agent-governance/local/` content. `git diff --check` must
report no whitespace errors.

The public runtime-proof workflow also stays in mock mode and never sets `RUNTIME_PROOF_REAL`.
It runs `npm run runtime:proof:mock`, which explicitly overrides any inherited real-mode opt-in.

## Governance

- Git repository initialized on branch `main`.
- `.DS_Store`, `node_modules/`, build outputs, editor folders, and env files are ignored by `.gitignore`.
- Do not change public readiness wording unless the validation commands above pass.
- Do not publish a governance-effectiveness claim unless a preregistered real paired report passes the documented claim gate.
