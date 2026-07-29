# ADR-003: Decision Review and Delivery Responsibility Model

## Status

Accepted for Milestone 1 on 2026-07-29 by the user's implementation request.

## Context

Consequential decisions need a portable multi-round recommendation contract,
while delivery tasks need deterministic responsibility assignment. Treating
debate seats as delivery roles would conflate analysis with execution and
could accidentally imply authority.

## Decision

Deliberation——四個 AI 對同一決策進行多輪提出、質疑、核證與綜合；其輸出是決策建議，不是人工批准。

The four Deliberation Seats use the `DLB-*` namespace and default to
`explorer`, `constraint-analyst`, `adversarial-reviewer`, and `synthesizer`.
They exist only in a four-round graph: independent proposal, cross critique,
option ranking, and synthesis. The core generates a plan and validates a
result; it never executes a seat or binds a provider.

Role Assignment——依任務、風險、技術棧與驗收要求，選出最少必要的執行、審查及驗證責任；角色不能自行取得額外工具、網路、憑證或寫入權限。

Delivery Roles use the `ROLE-*` assignment namespace and select from five
stable responsibilities:

- `decision-owner`
- `implementation-owner`
- `domain-reviewer`
- `risk-reviewer`
- `evidence-verifier`

Specialist role metadata is optional and external. A specialist name is never
an authority grant. When no specialist catalog is available,
`specialistRoleId` is `unassigned`; the governance responsibility remains
valid.

## Traceability

The complete logical flow is:

```text
SRC → REQ → DEC → AC → TASK → ROLE → POL → EVD → ATT
```

Milestone 1 materializes `DEC`, `DLB`, and `ROLE`. `POL` and `ATT` remain
future design targets. `OPEN_LOOP` may reference any unconfirmed `SRC`, `REQ`,
`DEC`, `TASK`, or `EVD`.

Deliberation Seat IDs and Delivery Role assignment IDs are disjoint:

- Deliberation: `DLB-001`
- Delivery assignment: `ROLE-001`

A seat name, result author, provider, persona, or specialist role cannot be
used as a Delivery Role assignment ID.

`decision.json` is validated as a closed semantic contract rather than adding
an eighth public Schema. It binds `decisionId`, revision, state, normalized
brief, sources, risks, trigger reasons, options, and supersession. The core
canonicalizes and hashes the complete record; the directory ID must match.
Plans record `decisionRevision` and `decisionSha256`.

## Deliberation Trigger and State

A decision recommends Deliberation when explicit structured input records any
of these reason codes:

- `USER_REQUESTED_FOUR_AI`
- `CONSEQUENTIAL_OR_IRREVERSIBLE`
- `MULTIPLE_REASONABLE_OPTIONS`
- `EVIDENCE_CONFLICT`
- `RESTRICTED_AUTHORITY_SURFACE`
- `THREE_OR_MORE_DOMAINS`
- `CANONICAL_RULE_CONFLICT`
- `HIGH_REPAIR_COST`

Otherwise the assessment reports `needsDeliberation: false` with
`DELIBERATION_NOT_REQUIRED`; no plan is created.

Plan state:

```text
planned → exported → superseded
```

An exported plan is immutable. It has a `planRevision` and
`planSha256`, computed over canonical content with the hash field
omitted. Changing decision content, the brief, source snapshot, seats, rounds,
rubric, redaction, or termination conditions creates a new plan revision and
hash; replay-incompatible changes also increment `graphVersion`.

Result state:

```text
external candidate → validated import → imported
imported → declared-human-confirmation action → human-confirmed
         → rejected | superseded
human-confirmed → superseded
```

`invalid` is a terminal import outcome and is not persisted as valid evidence.
`imported` is not `human-confirmed`. Import accepts and persists only
`imported`; incoming `human-confirmed` and confirmation-like data are rejected.
A graph, source revision, decision reference/revision/hash, or plan
revision/hash mismatch blocks import.

Only a separate explicit project-local action may create the closed
`human-confirmation.json` semantic record and transition the stored result.
The core, not the import file, computes the canonical persisted result hash.
The confirmation record exact-matches the decision, plan, and result hashes and
contains a bounded, non-secret actor label, timestamp, decision, and statement.
It is a declared human confirmation, not identity proof or runtime attestation.
An `active` decision without an exact-matching record is invalid, and
confirmation still does not rewrite `SPEC.md`, `TECH_STACK.md`, or an ADR.

## Deterministic Role Rules

- Low risk: one `implementation-owner`; add `evidence-verifier` only when
  independent evidence is explicitly required.
- Medium risk: `implementation-owner` plus one independent
  `domain-reviewer` or `evidence-verifier`.
- High/consequential: `implementation-owner`, `risk-reviewer`,
  `evidence-verifier`, and at most one necessary domain responsibility.
- No assignment contains more than four selected responsibilities.
- Security-sensitive authors cannot be final security approvers.
- Ambiguous specialist selection returns `needs-human-selection`.

Catalog capability metadata is an untrusted request and target capability
metadata describes technical support; neither grants authority. First compute
the effective ceiling as the most restrictive meet of user-confirmed project
constraints, active risk policy, canonical project rules, and every enabled
Pack. Then intersect the requested, scoped capability and target support with
that ceiling.

The restriction precedence follows:

```text
deny
→ require-human-approval
→ constrained-allow
→ allow
→ advisory
```

Authority sources are evaluated in this order:

```text
user-confirmed project governance
→ active risk policy
→ canonical project rules
→ optional pack
→ role request
→ target default
```

Authority priority chooses the canonical declaration within a source domain;
it never allows `allow` to defeat a `deny` or narrower scope from another
active constraint. A missing capability in the project ceiling is denied.
Catalog or role requests outside that ceiling yield
`ROLE_PRIVILEGE_EXPANSION`. Packs and assignment overrides can only narrow the
ceiling; raising it requires a separately reviewed risk-policy revision.

External catalog provenance must exact-match one pinned source-lock record,
including repository, commit, license, imported mode, and hash. Self-reported
catalog metadata is not authoritative.

## Human Override

Overrides are explicit declared-human revisions. They retain the prior
assignment in append-only history, identify the human decision record, and set
`supersedes`. They do not prove caller identity and cannot raise the effective
permission ceiling. Re-running an unchanged command produces identical bytes
and does not append a revision.

## Consequences

- The same governed data can feed manual or external adapters.
- Four-AI consensus remains a recommendation, not approval.
- Role selection is explainable through stable reason codes.
- No LLM guesses task risk or selects authority.
- Extra review is proportional to explicit risk rather than team size.

## Alternatives Considered

### Use four provider names as roles

Rejected. Provider uniqueness is adapter capability, not a core guarantee.

### Reuse one role namespace

Rejected. It would blur discussion function, delivery responsibility, and
permission.

### Let a catalog define permissions

Rejected. A catalog may request capabilities but cannot raise the active
project ceiling.

## Reopen Conditions

Reopen before changing graph replay compatibility, approval semantics,
permission precedence, the four-role cap, assignment history, or the
Deliberation Seat/Delivery Role namespace separation.
