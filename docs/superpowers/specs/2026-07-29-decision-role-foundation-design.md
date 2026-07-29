# Decision and Role Foundation Design

**Date:** 2026-07-29
**Status:** Approved by the user's Milestone 1 implementation request
**Base dependency:** `codex/public-promotion-readiness@e458c017468dbf4f9329ea51df4f1f5ad319c6b6` (open draft PR #7)

## Objective

Extend `agent-governance-starter` into an Agent-native Governance Bootstrap
Generator with a portable decision-review contract and deterministic delivery
responsibility selection. Milestone 1 generates and validates governance
documents, governance data, and agent-specific configuration inputs. It does
not execute an agent.

Success means a maintainer can:

- assess explicit task risk without free-text risk guessing;
- generate a portable four-seat deliberation plan without invoking a model;
- import and validate a deliberation result without treating consensus as
  human approval;
- assign the smallest necessary delivery responsibilities without raising the
  project permission ceiling;
- inspect the resulting project with stable doctor findings;
- preserve existing `init`, `doctor`, profiles, fixtures, and runtime adapters.

## Assumptions

1. PR #7 is the required base because it owns the privacy-safe
   `SRC → REQ → AC → TASK → EVD` chain and safe governance-file reads.
2. Milestone 1 remains one dependency-free Node.js package and uses
   `node:test`.
3. The detailed user request is the reviewed product specification; ordinary
   reversible implementation choices do not require another approval pause.
4. Missing Milestone 1 artifacts do not affect legacy projects until a project
   creates `.agent-governance/` or invokes a new command.
5. Project dates used in deterministic artifacts come from explicit governed
   input; the CLI does not insert the wall clock.

## Terms and Boundaries

Policy Compiler——將已確認的風險、專案規則與治理 Pack，轉換成各 Agent 工具可讀設定的純本地編譯器。

Attestation——比對宣告政策、編譯輸出與可觀察目標設定是否一致；不代表 Agent Runtime 一定遵守該政策。

Adapter——把中立治理資料轉換成特定工具格式的薄層；不得重複核心決策邏輯或執行 Agent。

Governance Pack——可選的流程、規則與檢查集合；只能增加限制或檢查，不能擴張既有權限。

Deliberation——四個 AI 對同一決策進行多輪提出、質疑、核證與綜合；其輸出是決策建議，不是人工批准。

Role Assignment——依任務、風險、技術棧與驗收要求，選出最少必要的執行、審查及驗證責任；角色不能自行取得額外工具、網路、憑證或寫入權限。

Evidence Graph——由穩定 ID 與引用構成的邏輯證據圖；使用 JSON／Markdown 與 doctor 驗證，不新增圖資料庫。

The product is not an Agent Runtime Framework, multi-Agent orchestrator,
desktop application, provider automation tool, Agent Marketplace, hosted
control plane, graph database, daemon, remote service, or general workflow
executor.

## Domain Model

```text
SRC source
  → REQ requirement revision
  → DEC human-controlled decision
  → AC acceptance criterion
  → TASK delivery task
  → ROLE delivery responsibility assignment
  → POL compiled policy (Phase 2)
  → EVD verification evidence
  → ATT attestation result (Phase 3)
```

`OPEN_LOOP` may reference an unconfirmed `SRC`, `REQ`, `DEC`, `TASK`, or `EVD`.

### Namespace Separation

| Concept | Namespace | Example | May grant authority |
|---|---|---|---|
| Source | `SRC-*` | `SRC-001` | No |
| Requirement revision | `REQ-*@revision` | `REQ-001@1` | No |
| Decision | `DEC-*` | `DEC-001` | Only through an explicit human decision record |
| Deliberation | `DLB-*` | `DLB-001` | No |
| Acceptance | `AC-*` | `AC-001` | No |
| Task | `TASK-*` | `TASK-001` | No |
| Delivery assignment | `ROLE-*` | `ROLE-001` | No; it is bounded by active policy |
| Policy | `POL-*` | `POL-001` | Future compiler input/output |
| Evidence | `EVD-*` | `EVD-001` | No |
| Attestation | `ATT-*` | `ATT-001` | No |

Deliberation Seats are workflow functions and use IDs derived from a `DLB-*`
record. Delivery Roles are project execution/review/verification
responsibilities and use `ROLE-*` assignment IDs. The two namespaces cannot be
substituted.

## Architecture

### Modular Monolith Core

| Module | Ownership |
|---|---|
| `scripts/agent-governance.mjs` | Umbrella CLI grammar, exit mapping, one-object JSON stdout, human diagnostics. |
| `scripts/lib/governance-artifacts.mjs` | Bounded exact JSON reads, path/symlink/UTF-8/privacy checks, canonical JSON/hash, atomic project-local writes. |
| `scripts/lib/decision-role-core.mjs` | Pure Schema semantics, risk assessment, deliberation trigger/plan/import, role selection, enabled-Pack permission intersection, and Pack listing. |
| `scripts/lib/decision-role-doctor.mjs` | Additive project inspection and stable finding codes. |
| `scripts/doctor.mjs` | Existing doctor orchestration plus the additive bridge. |
| `catalogs/governance-responsibilities.json` | Five minimal governance responsibility definitions. |

The core does not import governance-impact OCI, credential proxy, runtime
adapter, or provider code.

### External Adapters

- Multi-AI Chat Desktop Adapter: future file/manual handoff only; the pinned
  upstream revision exposes no stable public programmatic import.
- Agency Agents Catalog Adapter: future metadata-only normalization.
- Codex/Claude/Antigravity Policy Adapters: Phase 2 thin format conversion.
- Other runtime adapters: separate version/dependency boundary when necessary.

### Experimental

Live model execution, OCI containment, credential proxying, and real paired
evaluation remain separately gated experimental surfaces. Their existing
files and claims do not drift in Milestone 1.

## Project-Local Layout

```text
.agent-governance.json
.agent-governance/
  .gitignore
  risk-profile.json
  source-lock.json
  packs.lock.json
  decisions/
    DEC-001/
      decision.json
      deliberation-plan.json
      deliberation-result.json
      human-confirmation.json
  role-assignments/
    TASK-001.json
  local/
    README.md
    raw-deliberation/
    runtime-receipts/
```

`.agent-governance/.gitignore` ignores `local/` and is created before any
private local directory. On POSIX, `local/` is mode `0700` and files created
inside it are mode `0600`. Doctor verifies that the ignore rule is effective
and that `local/` is not a symlink, but never enumerates or scans its contents
as evidence.

Core commands do not generally inspect `local/`. The sole exception is the
single path explicitly supplied to `deliberate import --file`: the bounded
reader may read that named file, including when staged under `local/`, but
accepts only a normalized result contract and rejects raw prompts, raw model
output, provider sessions, cookies, credentials, and traces. The import source
never becomes evidence; only the separately validated normalized artifact may
persist. No command writes user-global settings.

## Schema Contracts

All seven governance artifact Schemas use JSON Schema draft 2020-12,
`schemaVersion: 1`, closed
objects, bounded arrays/strings, stable ID patterns, and relative portable
paths. JSON Schema validates shape; deterministic semantic validators own
cross-file references, duplicate IDs, state transitions, graph compatibility,
and permission ceilings.

`cli-output.schema.json` is a separate transport-envelope Schema, not an
eighth governance artifact. Every umbrella `--json` response validates as one
closed object with `schemaVersion`, `ok`, `command`, `code`, `status`,
`artifact`, `result`, and `findings`. Command-specific branches bind `result`
to the applicable artifact shape or to a closed read-only summary. The CLI
validates this envelope before emitting its one stdout object.

### Closed `decision.json` Semantic Contract

`decision.json` is governed by a closed semantic contract, not an eighth public
Schema. The exact-JSON reader and bounds used by the seven Schemas apply. Its
only allowed top-level fields are:

- `schemaVersion`: exactly `1`;
- `decisionId`: a `DEC-*` ID matching its directory;
- `revision`: a positive integer;
- `status`: `proposed`, `active`, `rejected`, or `superseded`;
- `topic` and `normalizedBrief`;
- unique `sourceRefs`, `requirementRefs`, and `riskRefs`;
- `triggerReasonCodes`;
- `options`: unique closed `optionId`/`summary` objects, with at least two
  entries when `MULTIPLE_REASONABLE_OPTIONS` is asserted;
- `needsDeliberation` and `humanApprovalRequired`;
- `createdAt`: explicit governed input, never a CLI wall-clock insertion;
- `supersedes`: the prior decision revision or `null`.

The core computes `decisionSha256` from the canonical bytes of this
closed record. A plan records the decision revision and hash. Unknown fields,
unknown versions, duplicate IDs, revision gaps, invalid transitions, or a
directory/record ID mismatch fail closed. `active` is not produced by importing
a deliberation result; it requires a separate valid declared-human-confirmation
transition.

### `risk-profile.schema.json`

Required top-level fields:

- `schemaVersion`
- `profileId`
- `status`: `declared`, `assessed`, or `needs-input`
- `sourceRefs`
- `permissionCeiling`
- `tasks`
- `openQuestions`

Each task records explicit `taskId`, active state, `declaredAt`, data classes,
surfaces, side effects, trigger flags, requested capabilities, required
evidence, and (after assessment) `riskLevel`, `needsDeliberation`, and reason
codes. Missing high-risk facts produce `needs-input`; they are not inferred
from prose.

Risk rules:

- restricted data, credentials, network authority, publish/delete, or an
  irreversible/consequential flag is high risk;
- schema/migration/security or multiple professional domains is at least
  medium risk;
- docs-only, public/internal data, project-local writes, one domain, and no
  external side effect is low risk;
- incomplete explicit fields are unknown and produce open questions.

### `source-lock.schema.json`

Each source requires:

- `sourceId`
- public `repository`
- exact 40-character commit
- `license`
- `importedFiles`
- `importedMode`: `metadata`, `adapted`, or `copied`
- `sha256`
- `attributionRequired`
- `fetchedAt`

Source IDs are unique. External revisions are pinned; license and hash cannot
be omitted. A Pack, catalog, selected specialist role, or deliberation source
that cites an external source must resolve to exactly one source-lock row and
match its repository, commit, license, imported mode, and content hash.
Self-reported catalog or Adapter provenance is never authoritative.

### `governance-pack.schema.json`

A Pack records an ID, version, source/revision/license/hash, status, controls,
mechanical checks, human-review checks, carrying cost, and retirement
condition. A Pack cannot define a capability grant or lower an active
restriction.

Each non-empty `packs.lock.json` entry records the exact project-local
`artifact` path and repeats the Pack ID, version, status, and complete source
metadata. An active entry is usable only when the summary, Pack artifact, and
one `source-lock.json` row exact-match, including `importedFiles`.

### `role-catalog.schema.json`

A catalog records a stable catalog ID/type, source revision/license/hash, and
unique role metadata. Roles distinguish `governance-responsibility` from
`specialist`, declare supported responsibilities/surfaces, and request
capabilities. Persona bodies are outside the core catalog.

### `role-assignment.schema.json`

Top-level fields:

- `schemaVersion`
- `assignmentId`
- `taskId`
- `revision`
- `status`
- `sourceRefs`
- `riskRefs`
- `selectedRoles`
- `rejectedRoles`
- `reasonCodes`
- `permissionCeiling`
- `separationOfDuties`
- `humanOverride`
- `createdAt`
- `supersedes`
- append-only `history`

Each selected role contains:

- `responsibility`
- `specialistRoleId`
- `source`
- `sourceCatalog`
- `sourceRevision`
- `sourceLicense`
- `sourceHash`
- `assignedTaskScope`
- `requiredInputs`
- `expectedDeliverables`
- `requestedCapabilities`
- `grantedCapabilityCeiling`
- `reviewResponsibility`
- `cannotApprove`
- `reasonCodes`

For an external catalog, the provenance fields must exact-match its
`source-lock.json` row and canonical catalog hash. Built-in responsibilities
use the package catalog version, repository license, and canonical built-in
catalog hash. Missing or mismatched provenance blocks the catalog; it is not
downgraded to an unverified specialist assignment.

For external specialists, `sourceCatalog` is the normalized project-local
catalog artifact path, so later doctor runs can reload the exact catalog and
verify its `sourceId`, repository, commit, license, imported mode, hash, and
locked path. The built-in catalog declares `hashScope: roles`; its digest is
the SHA-256 of the canonical `roles` array, avoiding a self-referential
whole-file digest while still binding every responsibility definition.

### `deliberation-plan.schema.json`

Required top-level fields are:

- `schemaVersion`, `deliberationId`, `decisionId`, `decisionRevision`,
  `decisionSha256`, `topic`, and `normalizedBrief`;
- `sourceRefs`, `sourceRevision`, `riskRefs`, `triggerReasonCodes`, and
  `profile`;
- `graphId`, `graphVersion`, `planRevision`, and `planSha256`;
- `needsDeliberation`, `seats`, `rounds`, `maxTurns`,
  `terminationConditions`, and `evaluationRubric`;
- `redactionTier`, `requiredOutput`, `humanApprovalRequired`, `preflight`,
  `beforeReceipt`, `afterReceiptContract`, and `status`.

Seat objects have a `DLB-SEAT-*` ID, one of the four functional seat names,
responsibilities, required inputs, and required outputs. They never contain a
Delivery Role ID or permission. Round objects are exactly rounds 1–4 with
`independent-proposal`, `cross-critique`, `option-ranking`, and `synthesis`;
each names participating seats, visible inputs, and required outputs.
`evaluationRubric` contains the six common criteria and a bounded integer
scale. `terminationConditions` covers completed rounds, unresolved-evidence
stop, turn limit, and blocked preflight. `requiredOutput` closes the expected
result sections. `preflight` is `ready` or `blocked` with stable check codes.
Before/after receipt objects carry only IDs, revisions, canonical hashes,
redaction tier, and state—never provider content.

`planSha256` is calculated over canonical plan bytes with that hash
field omitted, avoiding a circular digest. Plans are created only when the
deterministic trigger is true. Default redaction is `metadata-only`,
`humanApprovalRequired` is true, and the four rounds share one evaluation
rubric. Once exported, a plan is immutable; any change to its brief, source
snapshot, seats, rounds, rubric, redaction, or termination conditions creates
a new plan revision and content hash, and increments `graphVersion` when replay
compatibility changes.

### `deliberation-result.schema.json`

Required top-level fields are:

- `schemaVersion`, `deliberationId`, `decisionId`, `decisionRevision`,
  `decisionSha256`, `planRevision`, and `planSha256`;
- `graphId`, `graphVersion`, `adapter`, `adapterVersion`, `sourceRevision`,
  `executedAt`, and `redactionTier`;
- `seatResults`, `claims`, `evidenceRefs`, `disagreements`, `assumptions`,
  `unknowns`, and `rankedOptions`;
- `recommendation`, `confidence`, `humanDecisionRequired`, `importStatus`,
  `beforeReceipt`, and `afterReceipt`.

Each seat result uses a known plan seat ID and records only bounded synthesis,
assumptions, evidence references, risks, unknowns, critiques, and rankings.
Claims use stable IDs and evidence references; ranked options cover exactly
the decision option IDs and the six shared rubric scores. `confidence` is a
bounded numeric value paired with an explanation; it is not an approval
probability. `humanDecisionRequired` is always true. `importStatus` is one of
`imported`, `human-confirmed`, `rejected`, or `superseded`, subject to the
transition rules below.

The bounded before/after receipts identify graph/source inputs and normalized
output without raw provider content. Decision, graph, version, source
revision, and every content hash must exact-match the stored plan. After
validation, the core computes `resultSha256` from the canonical
persisted `imported` result; the import file cannot choose this digest.

An external result submitted to `deliberate import` must declare `imported`.
Incoming `human-confirmed` is rejected even when it carries a
confirmation-like object. Import persists only `imported`; it never creates a
human confirmation or activates a decision.

`human-confirmation.json` is a separate closed semantic record, not an eighth
public Schema. It records `schemaVersion`, `confirmationId`, `recordType:
declared-human-confirmation`, `decisionId`, `decisionRevision`,
`decisionSha256`, `deliberationId`, `planSha256`, `resultSha256`,
`decision: accept | reject`, `status: human-confirmed`, an explicit non-secret
`confirmedBy` label, `confirmedAt`, and a bounded `statement`. Only a separate explicit
project-local confirmation action may create it and transition the stored
result from `imported` to `human-confirmed`; import data cannot supply or
modify it. The record is a governance declaration of human confirmation, not
identity proof or runtime attestation. An `active` decision is valid only while
the confirmation record exact-matches that decision revision/hash; merely
setting `decision.json.status` to `active` is insufficient.

## State Machines

### Risk

```text
declared → assessed
declared → needs-input
needs-input → declared
```

### Deliberation

```text
planned → exported → superseded
external candidate → validated import → imported
imported → declared-human-confirmation action → human-confirmed
imported → rejected | superseded
human-confirmed → superseded
invalid = non-persisted import outcome
```

### Role Assignment

```text
assigned → superseded
needs-human-selection → assigned | superseded
blocked → superseded
```

A human override creates the next revision and appends the previous assignment
to history. An identical rerun does not create a revision.

## Deliberation Workflow

### Triggers

The core recommends Deliberation when structured input records:

- explicit four-AI request;
- consequential or irreversible decision;
- two or more reasonable options with architecture/product tradeoffs;
- evidence conflict;
- restricted data, credential, network, publish, or delete authority;
- three or more professional domains;
- conflict among ADR/REQ/TECH_STACK;
- high repair cost.

If none applies, output is `needsDeliberation: false` with
`DELIBERATION_NOT_REQUIRED`, and no plan is written.

### Four Rounds

1. Independent Proposal: each seat records assumptions, evidence, risks, and
   unknowns without seeing another proposal.
2. Cross Critique: each seat reviews another proposal and identifies
   verifiable defects.
3. Option Ranking: all seats rank the same options by requirement fit,
   feasibility, safety, reversibility, maintenance cost, and evidence strength.
4. Synthesis: the synthesizer records consensus, disagreement, rejected
   options, missing evidence, recommendation, uncertainty, and human decisions.

Provider uniqueness is an Adapter capability. The core does not bind
ChatGPT, Claude, Gemini, Grok, or any other provider.

## Role Assignment Rules

The built-in responsibility catalog contains only purpose, inputs, outputs,
responsibility, prohibited actions, and review relationship for:

- `decision-owner`
- `implementation-owner`
- `domain-reviewer`
- `risk-reviewer`
- `evidence-verifier`

Assignment is deterministic, reason-code driven, and capped at four roles.
Ambiguous specialist matching returns `needs-human-selection`.

| Explicit surface or risk | Required responsibility | Stable assignment reason |
|---|---|---|
| low-risk docs only | `implementation-owner` | `ROLE_MINIMUM_IMPLEMENTATION` |
| independent acceptance evidence | `evidence-verifier` | `ROLE_EVIDENCE_REQUIRED` |
| UI with accessibility acceptance | `domain-reviewer` | `ROLE_UI_ACCESSIBILITY_REVIEW` |
| credential, network, or restricted data | `risk-reviewer` | `ROLE_RESTRICTED_SURFACE_REVIEW` |
| publish or release | `risk-reviewer` and `evidence-verifier` | `ROLE_RELEASE_REVIEW`, `ROLE_EVIDENCE_REQUIRED` |
| schema or migration | `domain-reviewer` | `ROLE_COMPATIBILITY_REVIEW` |
| security-sensitive code | `risk-reviewer` with author separation | `ROLE_SECURITY_REVIEW`, `ROLE_AUTHOR_CANNOT_APPROVE` |

When several domain rules apply, the selector de-duplicates responsibilities
and keeps the four-role ceiling. If required responsibilities would exceed
four or two specialists match equally, it returns `needs-human-selection`
rather than guessing.

Catalog roles may request capabilities and target metadata may describe
technical support; neither is an authority source. The effective ceiling is
the most restrictive meet of all active constraints:

```text
effective ceiling =
  meet(
    user-confirmed project constraints,
    active risk policy,
    canonical project rules,
    all enabled optional Packs
  )

maximum grantable capability =
  requested role/catalog capability
  ∩ target-supported capability
  ∩ effective ceiling
```

Conflict precedence is:

```text
deny
→ require-human-approval
→ constrained-allow
→ allow
→ advisory
```

Source authority is:

```text
user-confirmed project governance
→ active risk policy
→ canonical project rules
→ optional pack
→ role request
→ target default
```

Source authority chooses the canonical declaration within a source domain; it
does not allow a higher-ranked `allow` to defeat a `deny` or narrower scope.
Restriction precedence is applied across all active sources before source
authority is considered. Packs and assignment overrides may only reduce the
effective ceiling. Raising it requires a separately reviewed risk-policy
revision; it cannot occur through role assignment. Capabilities include their
scope and constraints, so matching only a broad name such as `network` or
`credential` is insufficient. Unknown, broader, or differently scoped
capabilities are denied and reported as `ROLE_PRIVILEGE_EXPANSION`.

## CLI

Existing binaries remain:

```text
agent-governance-init
agent-governance-doctor
```

New commands:

```text
agent-governance assess <project> [--task <id>] [--json]
agent-governance deliberate plan <project> --decision <id> [--json]
agent-governance deliberate import <project> --file <path> [--json]
agent-governance deliberate confirm <project> --decision <id> --file <path> [--json]
agent-governance roles assign <project> --task <id> [--catalog <path>] [--override <path>] [--json]
agent-governance pack list <project> [--json]
```

`deliberate confirm` validates an independently supplied closed confirmation
record, binds it to the stored decision/plan/result hashes, and persists the
declared confirmation. It never accepts confirmation fields from the imported
result and does not establish caller identity.

`--override` is an explicit Milestone 1 extension needed to implement
append-only human assignment revisions. Its file contains a closed declared
human override record; it does not prove caller identity and cannot grant
capabilities outside the active ceiling.

JSON stdout contains exactly one object:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "roles.assign",
  "code": "OK",
  "status": "assigned",
  "artifact": ".agent-governance/role-assignments/TASK-001.json",
  "result": {},
  "findings": []
}
```

Progress and diagnostics go to stderr. Human mode is concise and does not
reflect sensitive input.

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Command completed and produced/validated the requested result. |
| `1` | Governed input is incomplete (`needs-input` or `needs-human-selection`). |
| `2` | CLI usage error. |
| `3` | Schema or semantic validation failed. |
| `4` | Fail-closed safety, privacy, reference, permission, or replay block. |
| `5` | Bounded local I/O failed without a safe artifact. |

Normal commands never use network APIs, install a Plugin, execute an Agent or
model, read credentials, or modify user-global configuration.

## Doctor Findings

The additive doctor bridge emits the requested stable codes:

- `RISK_INPUT_MISSING`
- `RISK_PROFILE_INVALID`
- `DECISION_REFERENCE_MISSING`
- `DELIBERATION_REQUIRED`
- `DELIBERATION_RESULT_INVALID`
- `DELIBERATION_VERSION_MISMATCH`
- `DELIBERATION_NOT_HUMAN_CONFIRMED`
- `TASK_REFERENCE_MISSING`
- `ROLE_ASSIGNMENT_MISSING`
- `ROLE_CATALOG_INVALID`
- `ROLE_PRIVILEGE_EXPANSION`
- `ROLE_SEPARATION_VIOLATION`
- `SOURCE_REVISION_UNPINNED`
- `SOURCE_LICENSE_MISSING`
- `PRIVATE_CONTENT_BLOCKED`
- `PATH_ESCAPE_BLOCKED`
- `SYMLINK_BLOCKED`
- `SECRET_VALUE_BLOCKED`

Legacy projects without `.agent-governance/` receive no new warning. In normal
mode, triggered-but-incomplete optional artifacts are warnings. Privacy,
symlink, path, and secret violations fail in every mode. Strict mode also
fails for a high-risk active task without an assignment, a required active
decision without a human-confirmed result, privilege expansion, separation
violation, or invalid external source.

## Privacy and File Safety

- Maximum JSON artifact size: 1 MiB.
- UTF-8 decoding is fatal; replacement decoding, UTF-8 BOM, NUL, and trailing
  non-JSON bytes are rejected.
- Exact JSON permits at most 64 nesting levels and 10,000 aggregate object
  members plus array elements, in addition to each Schema's tighter bounds.
- Input size is checked with `fstat` after opening and the reader consumes at
  most the limit plus one byte from that file descriptor; a prior path `stat`
  is never trusted.
- Every existing path component from the real project root to an input or
  output parent is checked and symlinks are rejected. Reads use no-follow open
  plus post-open `fstat` identity/type checks, or a platform-equivalent
  primitive. If equivalent guarantees cannot be established, the operation
  fails closed with `SYMLINK_BLOCKED`.
- Writes create their temporary file inside the already verified parent,
  retain and re-check parent identity before a no-replace rename, and reject
  any component or identity change. A detected race leaves no success artifact.
- Relative portable paths reject traversal, absolute POSIX paths, Windows
  drive/UNC paths, and absolute home paths.
- Exact JSON rejects duplicate object keys after escape decoding, including
  equivalent spellings such as `"a"` and `"\u0061"`; semantic validation
  rejects duplicate stable IDs.
- Privacy scanning blocks raw prompt/output fields, provider sessions/cookies,
  credentials, high-confidence token forms, and secret-bearing query strings.
- Errors contain stable code and safe subject only; they do not reflect the
  matched value or external absolute path.
- Writes are atomic and no-replace except a validated state transition to the
  same governed artifact.
- Doctor verifies the `local/` ignore boundary and symlink status without
  traversing that directory. Missing or unsafe ignore coverage fails closed
  before private staging is created.

## Error Handling

The earliest failed handoff owns the error. Parsing, privacy, reference,
transition, permission, and persistence failures remain distinct. A blocked
import or assignment writes no success artifact. An existing valid artifact
is preserved when a later update fails.

No command turns `invalid` into `imported`, import input directly into
`human-confirmed`, or a denied capability into an allow state to preserve
compatibility. Only the separate declared-human-confirmation transition may
advance a stored `imported` result, and it must exact-match the stored decision,
plan, and result hashes.

## Migration and Compatibility

- No new root required document is added.
- Existing `.agent-governance.json` schema version remains readable.
- Existing `init` remains skip-existing and does not generate the new
  directory unless a new command needs it.
- Existing doctor JSON schema version and legacy warning strings remain
  compatible; new findings are additive.
- Existing profiles, template fixtures, and runtime adapters remain unchanged
  unless a test proves a required compatibility update.
- An old project opts in by invoking `assess`, `deliberate`, `roles`, or
  creating a valid `.agent-governance/` directory.
- Unknown versions in present new artifacts fail closed; absence in a legacy
  project does not.

## Commands

```text
Syntax: npm run check
Starter validation: npm run validate
Focused Milestone 1: npm run test:decision-role
All deterministic checks: npm run ci
Fixtures: npm run fixtures
Strict fixtures:
  node scripts/doctor.mjs --strict examples/template-adoption/base-minimal
  node scripts/doctor.mjs --strict examples/template-adoption/fullstack-ai-saas
  node scripts/doctor.mjs --strict examples/template-adoption/macos-beta-handoff
Package: npm pack --dry-run --json
Whitespace: git diff --check
```

## Project Structure

```text
catalogs/                         built-in responsibility metadata
schemas/                          seven new closed contracts
scripts/agent-governance.mjs      umbrella CLI
scripts/lib/                      pure core, safe artifact I/O, doctor bridge
tests/decision-role/              focused node:test suites and fixture overlays
docs/adr/                         durable architecture decisions
docs/research/                    pinned source adoption
docs/superpowers/specs/           approved design
docs/superpowers/plans/           implementation plan
```

## Code Style

Use ESM, Node standard-library imports, closed data, explicit return values,
and stable non-reflective errors:

```js
export function assessTaskRisk(task) {
  const findings = validateDeclaredRisk(task);
  if (findings.length > 0) {
    return {
      status: 'needs-input',
      riskLevel: 'unknown',
      reasonCodes: ['RISK_INPUT_MISSING'],
      findings,
    };
  }
  return deriveRiskFromDeclaredFields(task);
}
```

Avoid classes, hidden global state, provider conditionals, generic workflow
engines, and abstractions without at least two concrete uses.

## Testing Strategy

Use real files and CLI processes with `node:test`, `assert/strict`,
`mkdtempSync`, `spawnSync(process.execPath, ..., { shell: false })`, and
`t.after` cleanup.

Required fixture overlays:

1. `low-risk-docs-task`
2. `architecture-decision`
3. `restricted-publish-task`
4. `malicious-role-catalog`
5. `replay-version-mismatch`
6. `privacy-negative`

Coverage includes deterministic/double-run behavior, positive/negative Schema
semantics, dry local operation, portable Windows/macOS/Linux path forms,
CRLF/LF, UTF-8, symlinks, traversal, size limit, privacy scanner, stable
findings, legacy init/doctor, existing fixtures, runtime-adapter no-drift,
no-network imports, and no user-global writes.

Every production behavior follows red-green-refactor. Tests must fail for the
missing behavior before implementation.

## Boundaries

### Always

- Preserve the product and privacy boundary.
- Use explicit structured inputs and stable reason codes.
- Intersect requested capability with the active ceiling.
- Validate native artifacts and rerun affected checks.
- Keep human confirmation distinct from import or model consensus.

### Ask First

- Add a runtime dependency.
- Change an existing public API incompatibly.
- Change a Schema serialization contract after publication.
- Write user-global configuration.
- Commit, push, publish, release, deploy, or access a credential.

### Never

- Execute an Agent or external model.
- Automate provider login, WebView, cookies, or private interfaces.
- Add a database, daemon, hosted service, scheduler, or marketplace.
- Persist raw prompts, raw model output, credentials, private traces, or
  absolute home paths.
- Claim runtime enforcement from materialized or observed settings.

## Future Roadmap (Design Only)

### Phase 2: Risk-to-Policy Compiler

`compile <project> --target codex|claude|antigravity` will transform active
risk policy and Packs into a canonical policy manifest plus thin target
formats. The core remains the single decision source; unsupported controls are
reported and no Agent is executed.

The future `policy-manifest.json` contract contains a version, project policy
revision, exact input hashes, ordered `POL-*` controls, every control's
effect/scope/constraints/source authority, target capability observations,
unsupported controls, generated-file manifest, and a canonical content hash
that excludes its own digest. Compilation will:

1. validate and canonicalize the active risk profile, project rules, and
   source-locked Packs;
2. compute the restriction meet and stable control order;
3. pass neutral controls to one selected thin Adapter;
4. require the Adapter to report supported, approximated, and unsupported
   controls without inventing enforcement;
5. write project-local outputs atomically and record deterministic hashes.

Phase 2 implementation begins with manifest and Adapter-contract tests, then a
reference Adapter, then Codex, Claude, and Antigravity format tests. It covers
double-run output, unsupported controls, no global write, no network,
migration, stale generated-file ownership, and license/provenance changes.

### Phase 3: Effective Policy Attestation

`attest <project> --target codex` will distinguish `declared`,
`materialized`, `observed`, and `runtime-evidenced`. A general adapter may
claim at most `observed` without real runtime evidence.

A future `ATT-*` result binds the policy manifest hash, target
Adapter/version, expected generated-file hashes, observed project-local
setting hashes, unsupported controls, comparison findings, caller-supplied
observation time, and attained level. The deterministic comparison is:

1. `declared` when a valid canonical manifest exists;
2. `materialized` only when all owned Adapter outputs exact-match manifest
   hashes;
3. `observed` only when the Adapter can read a documented project-local target
   setting whose normalized value matches the declared control;
4. `runtime-evidenced` only when a separately approved runtime evidence
   contract is supplied and validated.

Missing or unknown settings, unsupported target controls, stale files, hash
mismatch, or unverifiable normalization produce findings and never upgrade
the level. Phase 3 tests cover downgrade paths, stale evidence, Adapter
version changes, normalized comparison, and the prohibition on describing
`observed` as runtime enforcement.

### Phase 4: Optional Packs and External Adapters

Engineering process, minimal change, UI quality, repository review, Agency
Agents catalog, and Multi-AI deliberation adapters remain optional,
versioned, source-locked, non-authority-expanding units.

Each Pack declares mechanical checks, human-review checks, carrying cost, and
retirement condition. Each external Adapter has independent versioning,
source locks, compatibility fixtures, and a release boundary. Agency persona
materialization, if later justified, uses an explicit
`roles persona materialize` command with project-local default, mandatory
dry-run first, create/overwrite/delete preview, target-capacity checks,
stale-owned-output cleanup, and license notice preservation. It refuses
user-global writes unless a separately reviewed future command and approval
contract exists. Multi-AI integration remains JSON/file handoff unless a
pinned upstream publishes a stable supported import API.

### Phase 5: Experimental or Separate Project

Live multi-model orchestration, provider web automation/session state, hosted
policy service, general scheduler, marketplace, OCI runtime containment,
credential proxy, and live paired evaluator do not enter the core main path.

These capabilities need separate threat models, dependencies, release cadence,
credentials, runtime evidence, and failure containment. Continued OCI or
real-evaluator work stays an experimental package or separate repository and
cannot block the dependency-free core release. Offline fixtures remain
contract evidence only and cannot support a live-effectiveness claim.

## License Treatment

Exact source revisions and adoption decisions live in
`docs/research/source-adoption-matrix.md`. Harness Engineering conceptual
adaptation retains CC BY 4.0 attribution in `THIRD_PARTY_NOTICES.md`. No
substantial MIT source, persona, prompt, or code is copied in Milestone 1.

## Success Criteria

- Seven Schemas and semantic validators reject all listed unsafe or invalid
  cases.
- New CLI commands are deterministic, local, and documented.
- Deliberation import is fail-closed and cannot self-approve.
- Role assignment is deterministic, explainable, capped, and permission
  bounded.
- Doctor emits stable codes while legacy strict fixtures still pass.
- All focused tests, canonical deterministic checks, package dry run, and diff
  checks pass from a reviewable final tree; any commit-bound release gate that
  cannot run without commit authorization is reported explicitly rather than
  weakened.
