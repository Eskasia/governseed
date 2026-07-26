# Linux Codex OCI Containment Implementation Plan

## Goal

Implement the ADR-001 Linux/Codex-only real evaluator route without weakening
the existing host-runtime fail-closed behavior, v1 synthetic evidence, public
forced-mock CI, privacy boundary, or oracle/persistence ordering.

## Success contract

- v1 synthetic controls, manifests, hashes, raw runs, and scored results remain
  byte- and behavior-compatible.
- v2 OCI evidence pins one `executionBoundaryId` into the cohort, attempt
  identity, both arms, and scored output.
- A separate credential-free manual preflight emits one closed
  `READY + NOT_EVALUATED` receipt containing the exact provenance, model,
  timeout, observed boundary evidence, and `executionBoundaryId`.
- Linux/Codex real execution can start only after a human reviews and commits
  the receipt, schema-v2 manifest, policy, and synthetic scenario, and a fresh
  preflight exactly matches the receipt and manifest.
- The provider credential is read lazily only after boundary matching. The
  container receives an attempt-scoped bearer, never the upstream key.
- The sequence is container run, stopped/empty proof, oracle and snapshot,
  per-arm cleanup proof, score, then atomic persistence.
- Docker `NetworkMode=none` keeps only container loopback. A host process enters
  the container network namespace with narrowly reviewed `sudo -n nsenter`,
  listens on loopback, and connects to the host-only UDS without bind-mounting
  that socket into the container. One bounded stdin line carries closed relay
  configuration; subsequent EOF is the relay lifeline. Relay secrets never
  depend on `sudo` environment preservation or `sudoers env_keep`.
- Provider requests require exact model and deadline, `store: false`,
  progressive `stream: true`, no background or server state, stripped client
  identifiers, and client-executed tools only. The client replay loop is
  limited to 32 sequential requests, 1 MiB per request, 4 MiB per response,
  and one active request.
- Host Codex, Claude, Antigravity, macOS, Windows, and every unproved fallback
  remain fail-closed.
- No unsafe path produces a candidate run artifact or reflects credentials,
  tokens, bodies, absolute private paths, or raw child output.
- Public CI remains offline/mock. Real Docker and provider execution are
  isolated in an approval-gated manual workflow.

## Boundaries

- Do not modify the user-owned hunks in `README.md`,
  `docs/adr/000-template.md`, `templates/README.md`, or
  `workflows/fullstack.md`.
- Do not publish a runtime image, merge, deploy, or release.
- Do not read, print, persist, or pass the upstream credential to a container.
- Do not bind-mount the host credential-proxy UDS into the container.
- Do not combine credential-free preflight and credentialed real execution into
  one automatically chained workflow or skip human review and commit.
- Do not mark Criterion 4 PASS from unit/mock tests or design approval.
- Do not make `runtimeCapabilities('codex', 'linux').processTree` true for the
  existing host adapter.

## TDD slices

### 1. Versioned evidence identity

Write failing tests first for v2 manifest normalization, attempt hashing,
same-boundary pairing, mismatched-boundary rejection, and closed raw/scored
boundary evidence. Preserve all v1 fixtures unchanged. Implement the minimum
conditional v2 schema/core path.

Verification:

```bash
node --test tests/governance-impact/scorer.test.mjs tests/governance-impact/scenario-schema.test.mjs
```

### 2. Host credential proxy

Write failing unit tests first for exact bearer/attempt/method/path/model,
1 MiB request and 4 MiB response limits, the 32-request attempt quota,
single concurrency, deadline, quota rejection, lifecycle shutdown, and zero
sensitive logging. Lock
`POST /v1/responses` to `store: false`, `stream: true`, no background or
server-side state, identifier stripping, and client-executed tool types.
Support only a bounded self-contained client replay loop; reject
`previous_response_id`, `conversation`, and `prompt`. Progressively forward
bounded SSE with backpressure instead of buffering the complete response.
Implement a Unix-domain HTTP proxy with dependency-injected upstream
transport. Do not claim live Codex compatibility from these tests.

Verification:

```bash
node --test tests/governance-impact/credential-proxy.test.mjs
node --test tests/privacy/governance-impact-proxy-negative.test.mjs
```

### 3. OCI supervisor lifecycle

Write failing unit tests first for reviewed provenance validation, canonical
policy hashing, Docker create/inspect/start/wait ordering, hardened config,
FIFO lifeline ownership, cgroup-path capture, `populated 0`, stopped cgroup
removal, reconciliation, timeout/non-zero semantics, cleanup uncertainty, and
sanitized evidence. Add a host-netns relay that runs through exact
`sudo -n nsenter --net=/proc/<init-pid>/ns/net`, binds only container
loopback, reaches the host UDS from the host mount namespace, and must report
ready before Codex starts. Send one bounded closed configuration line over
parent-owned stdin, then use EOF as the relay lifeline; do not pass relay
secrets in argv, inherited environment, or a `sudoers env_keep` rule. Implement
the supervisor behind injected Docker/procfs/proxy clients; do not open the
production router yet.

Verification:

```bash
node --test tests/governance-impact/oci-supervisor.test.mjs
```

### 4. Paired-run and CLI integration

Write failing tests first for:

- safe output-path validation before any Docker or proxy mutation;
- credential-free `preflight` receipt generation without reading
  `OPENAI_API_KEY`;
- tracked-clean receipt/manifest/policy/scenario enforcement;
- exact receipt/provenance/model/timeout/manifest/fresh-boundary matching before
  lazy credential access;
- Linux/Codex OCI routing without host binary or `CODEX_HOME`;
- all other real routes retaining `SESSION_SAFETY_UNAVAILABLE`;
- run, empty-boundary proof, oracle, snapshot, per-arm cleanup, score, persist;
- child timeout/non-zero remaining safe delivery evidence after all proofs;
- preflight refusal as `BLOCKED + NOT_EVALUATED`;
- post-launch control failure as `FAIL-CLOSED + NOT_EVALUATED`;
- no artifact on containment, proxy, privacy, oracle, cleanup, comparability,
  or persistence failure.

Then connect the supervisor through a dedicated arm-session seam rather than
overloading `runChildSafely`.

Verification:

```bash
node --test tests/governance-impact/cli.test.mjs tests/governance-impact/runner.test.mjs
node --test tests/privacy/eval-negative.test.mjs tests/privacy/runtime-proof-negative.test.mjs
```

### 5. Linux integration proof surface

Add an explicit opt-in Linux Docker test fixture and write integration tests
for normal completion, evaluator disconnect, supervisor `SIGKILL`, timeout,
non-zero exit, `setsid`, re-parenting, proxy/relay death, cleanup failure,
cgroup empty proof, and no artifact on unsafe paths. Non-Linux/cgroup-v2
absence must return a structured `BLOCKED`, not a passing skip. Fixture and
mock-upstream results remain implementation proof only; they are not live
provider or Criterion 4 evidence.

Verification:

```bash
npm run test:governance-impact:oci:integration
```

This command is not part of public `npm run ci`.

### 6. Manual workflow and validator

Write validator-negative tests first for real opt-in in push/PR workflows,
missing environment approval, unsafe runner selection, secret exposure,
unreviewed image inputs, or artifact upload of failed staging. Add two
`workflow_dispatch`-only Linux workflows:

1. a credential-free preflight workflow with no Environment or secret that
   uploads only the exact closed receipt;
2. an approval-gated real workflow that accepts the committed receipt path,
   exact provenance and timeout, uploads only successful paired evidence, and
   always runs cleanup.

Human review and commit occur between these workflows; no automatic chaining
is permitted. Keep all existing public workflows offline/forced-mock.

Verification:

```bash
npm run validate
npm run test:governance-impact
npm run test:privacy
```

### 7. Documentation, audit, and release-unit checks

Update the canonical evaluator contract, changelog, and final audit with only
fresh evidence. Keep unsupported routes and missing external prerequisites
explicitly fail-closed or blocked.

Verification in a clean reviewed worktree:

```bash
npm run ci
npm run runtime:proof
node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
npm pack --dry-run --json
git diff --check
```

### 8. Independent review and hosted evidence

Run an independent security/diff review. A maintainer may create selective
commits, push the reviewed branch, open a PR, and verify the hosted
Ubuntu/macOS/Windows public matrix only with explicit authorization. Run the
credential-free preflight first. Human-review and commit its receipt plus the
v2 manifest/policy/scenario before running the approval-gated Linux real
workflow, and only when the Environment, credential, reviewed pullable image
provenance, cgroup-v2 host, and narrowly reviewed `sudoers`/`nsenter` path
actually exist.

Completion remains:

- `PASS` only for evidence freshly proven on the final reviewed tree;
- `BLOCKED` for a missing external image, provenance, environment, or
  credential, committed receipt, Linux/cgroup-v2 host, `sudoers`/`nsenter`
  boundary, or live provider evidence;
- `FAIL-CLOSED` for any post-launch safety or integrity uncertainty;
- `PARTIAL` when valid evidence exists but preregistered coverage is
  incomplete.

## Parallel ownership

- Schema owner: `scripts/lib/governance-impact-core.mjs`,
  `schemas/governance-impact-*.schema.json`, and their scorer/schema tests.
- Proxy owner: the new credential-proxy module and dedicated proxy/privacy
  tests.
- Supervisor owner: the new OCI supervisor module, dedicated supervisor tests,
  and Linux integration fixture.
- Primary agent: shared evaluator/CLI integration, adapters, package scripts,
  validator, workflows, documentation, final integration, review, commits,
  push, PR, and acceptance.

Every owner must preserve other workspace changes, record a real RED result
before implementation, and report exact commands and remaining risks. This
plan does not itself authorize commit, push, pull request, Environment changes,
secret access, provider use, or publication.

## Current Evidence Boundary

The code, schemas, workflows, unit tests, privacy tests, and explicit opt-in
fixture integration surface implement Scheme A. The credential-free receipt
and real workflow remain separate, the relay uses host `nsenter` rather than a
bind-mounted UDS, and public CI remains offline.

Criterion 4 is still `BLOCKED`. Unlock requires fresh evidence on the final
reviewed commit from the actual disposable Linux/cgroup-v2 host, the exact
reviewed `sudo -n`/`nsenter` command boundary and bounded stdin lifeline, real
netns-to-host-UDS behavior, a pullable digest-pinned Codex image, the bounded
no-server-state client tool loop, the provider request and progressive SSE
path, adversarial teardown and cleanup cases, and a real paired run. No
unit/mock/fixture result, plan, ADR, `READY` receipt, or GitHub Environment
approval is a substitute.
