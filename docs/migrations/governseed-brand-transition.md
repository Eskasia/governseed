# GovernSeed Brand Transition

GovernSeed was previously developed as `agent-governance-starter`. Stage 1
changes the public display brand only. It does not change the product boundary,
execute an Agent, add a hosted service, or begin the Risk-to-Policy Compiler.

## Stage 1 Contract

| Surface | Stage 1 state |
|---|---|
| Display brand | `GovernSeed` |
| Formal brand | `Eskasia GovernSeed` |
| Tagline | Governance foundations for agent-native projects. |
| npm package name | `agent-governance-starter` — unchanged |
| Generator machine identifier | `agent-governance-starter` — unchanged |
| CLI commands | `agent-governance`, `agent-governance-init`, and `agent-governance-doctor` — unchanged |
| Project configuration | `.agent-governance.json` and `.agent-governance/` — unchanged |
| Schema, version, field, finding, and evidence IDs | unchanged |
| GitHub repository | `Eskasia/agent-governance-starter` — unchanged pending manual Stage 2 approval |

The future npm candidate `@eskasia/governseed` and CLI alias `governseed`
require separate ADRs and pull requests. They are not part of this transition.

## Legacy Token Classification

Every retained legacy-name occurrence is classified below. Counts are enforced
by `tests/brand/brand-compatibility.test.mjs`; any new occurrence fails the
brand test until it is reviewed and classified.

| Path | Count | Classification | Reason |
|---|---:|---|---|
| `.github/ISSUE_TEMPLATE/config.yml` | 1 | repository reference pending manual rename | Security-policy URL must keep resolving before Stage 2. |
| `CHANGELOG.md` | 1 | compatibility text | Records the former public name once. |
| `README.md` | 8 | compatibility text; repository reference pending manual rename | One transition statement plus current badge, clone, and command paths. |
| `THIRD_PARTY_NOTICES.md` | 1 | historical record | Attribution wording records the project name at adaptation time. |
| `docs/migrations/governseed-brand-transition.md` | 4 | compatibility text; legacy machine identifier; repository reference pending manual rename | Owns the transition contract and protected identities. |
| `docs/superpowers/specs/2026-07-13-governance-evidence-overhaul-design.md` | 1 | historical record | Preserves the approved historical specification. |
| `docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md` | 1 | historical record | Preserves the approved historical specification. |
| `examples/template-adoption/base-minimal/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `examples/template-adoption/base-minimal/PROJECT_BRIEF.md` | 1 | repository reference pending manual rename | Fixture source pointer remains valid. |
| `examples/template-adoption/fullstack-ai-saas/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `examples/template-adoption/macos-beta-handoff/.agent-governance.json` | 1 | legacy machine identifier | Fixture generator value remains compatible. |
| `package.json` | 1 | legacy machine identifier | Published package identity is protected in Stage 1. |
| `schemas/*.schema.json` | 13 | legacy machine identifier | Existing schema `$id` contracts remain stable. |
| `scripts/init.mjs` | 2 | legacy machine identifier; repository reference pending manual rename | Generated metadata and the current doctor path remain compatible. |
| `scripts/validate-starter.mjs` | 3 | compatibility text; repository reference pending manual rename | Validator protects the transition statement, current documented doctor path, and generated-project compatibility identifier. |
| `templates/runtime/README.md` | 2 | compatibility text; repository reference pending manual rename | Generated projects explain the transition while preserving the doctor path. |
| `tests/governance/traceability.test.mjs` | 10 | repository reference pending manual rename | Synthetic traceability fixtures keep the current public source pointer. |

There are no retained occurrences classified as `missed public-brand
occurrence`.

## Stage 2 Manual Gate

Only after this brand pull request is merged and a human explicitly approves
Stage 2 may the GitHub repository be renamed to `Eskasia/governseed`. That
separate operation must verify redirects, Actions, branch protection, issues,
pull requests, releases, badges, clone URLs, and local remotes.

This preliminary name audit is not legal clearance and does not reserve a
repository, package, domain, organization, or trade mark.
