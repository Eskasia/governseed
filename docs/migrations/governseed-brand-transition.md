# GovernSeed Brand Transition

GovernSeed was previously developed as `agent-governance-starter`. Stage 1
changed the public display brand. A separately approved repository transition
then renamed the GitHub repository to `Eskasia/governseed`. Neither change
renames compatibility-sensitive package, CLI, schema, generator, configuration,
or evidence identifiers.

## Current Contract

| Surface | Current state |
|---|---|
| Display brand | `GovernSeed` |
| Formal brand | `Eskasia GovernSeed` |
| Tagline | Governance foundations for agent-native projects. |
| npm package name | `agent-governance-starter` — unchanged |
| Generator machine identifier | `agent-governance-starter` — unchanged |
| CLI commands | `agent-governance`, `agent-governance-init`, and `agent-governance-doctor` — unchanged |
| Project configuration | `.agent-governance.json` and `.agent-governance/` — unchanged |
| Schema, version, field, finding, and evidence IDs | unchanged |
| GitHub repository | `Eskasia/governseed` — repository transition completed on 2026-07-29 |

The future npm candidate `@eskasia/governseed` and CLI alias `governseed`
require separate ADRs and pull requests. The completed repository transition
does not authorize either change.

## Legacy Token Classification

Every retained legacy-name occurrence is classified below. Counts are enforced
by `tests/brand/brand-compatibility.test.mjs`; any new occurrence fails the
brand test until it is reviewed and classified.

| Path | Count | Classification | Reason |
|---|---:|---|---|
| `CHANGELOG.md` | 1 | compatibility text | Records the former public name once. |
| `README.md` | 1 | compatibility text | Records the former public name once. |
| `THIRD_PARTY_NOTICES.md` | 1 | historical record | Attribution wording records the project name at adaptation time. |
| `docs/migrations/governseed-brand-transition.md` | 3 | compatibility text; legacy machine identifier; completed repository transition | Owns the transition contract and protected identities. |
| `docs/superpowers/specs/2026-07-13-governance-evidence-overhaul-design.md` | 1 | historical record | Preserves the approved historical specification. |
| `docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md` | 1 | historical record | Preserves the approved historical specification. |
| `examples/template-adoption/base-minimal/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `examples/template-adoption/fullstack-ai-saas/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `examples/template-adoption/macos-beta-handoff/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `package.json` | 1 | legacy machine identifier | Published package identity is protected in Stage 1. |
| `schemas/*.schema.json` | 13 | legacy machine identifier | Existing schema `$id` contracts remain stable. |
| `scripts/init.mjs` | 1 | legacy machine identifier | Generated metadata keeps the compatibility identifier. |
| `scripts/validate-starter.mjs` | 2 | compatibility text; legacy machine identifier | Validator protects the transition statement and generated-project compatibility identifier. |
| `templates/runtime/README.md` | 1 | compatibility text; legacy machine identifier | Generated projects explain the retained generator identifier. |
| `tests/governance/traceability.test.mjs` | 10 | historical record | Synthetic test strings preserve their reviewed historical source values; they are not public navigation links. |

There are no retained occurrences classified as `missed public-brand
occurrence`.

## Completed Repository Transition

The human-approved repository rename completed on 2026-07-29. Public badges,
clone commands, security-policy links, fixture source pointers, generated
doctor instructions, and local remotes now use `Eskasia/governseed` or the
default checkout directory `governseed`. GitHub redirects may preserve old
links, but new public guidance does not depend on that redirect.

This preliminary name audit is not legal clearance and does not reserve a
repository, package, domain, organization, or trade mark.
