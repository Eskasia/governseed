# GovernSeed Documentation

## Start Here

| File | Purpose |
|---|---|
| `../README.md` | Public positioning, quick start, file map |
| `../startup/00-agent-start-here.md` | Mandatory agent rules and report format |
| `../startup/01-bootstrap-gates.md` | Q1-Q9 intake and progression gates |
| `../startup/02-required-project-docs.md` | Required and conditional project docs |
| `runtime-proof.md` | Mock and real runtime proof commands for generated adapters |
| `governance-impact-eval.md` | Paired evaluator contract, privacy boundary, claim gate, and non-claims |
| `policy-compiler.md` | Phase 2 compiler inputs, merge rules, CLI, outputs, findings, and non-claims |
| `enforcement-boundary.md` | What `materialize` writes, what `attest` observes, and what neither establishes |
| `research/2026-07-29-codex-policy-capability-matrix.md` | Official Codex capability evidence and honest Adapter classifications |
| `research/2026-07-31-claude-code-policy-capability-matrix.md` | Official Claude Code capability evidence, structural findings, and BLOCKED items |
| `superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md` | Policy Compiler architecture, schemas, transaction, privacy, and testing contract |
| `superpowers/plans/2026-07-29-risk-to-policy-compiler-plan.md` | Test-first Phase 2 implementation and verification plan |
| `superpowers/specs/2026-07-29-decision-role-foundation-design.md` | Milestone 1 decision, role, schema, CLI, privacy, migration, testing, and future-roadmap design |
| `superpowers/plans/2026-07-29-decision-role-foundation-plan.md` | Test-first implementation and verification plan |
| `superpowers/specs/2026-07-30-materialization-attestation-design.md` | Milestone 3 materialization identity, attestation contract, and claim ceiling |
| `superpowers/plans/2026-07-30-milestone-3-materialization-attestation-plan.md` | Test-first Milestone 3 implementation and verification plan |
| `superpowers/plans/2026-07-31-milestone-4-runtime-materialization-parity-plan.md` | Test-first Milestone 4 runtime materialization parity plan |
| `superpowers/reviews/2026-07-26-governance-evidence-overhaul-audit.md` | Independent review, QA evidence, completion matrix, and release blockers |

## Proposed Direction And Experiments

| File | Status and purpose |
|---|---|
| `experiments/cross-agent-project-workbench.md` | Proposal only: shared project state, change graph, personalization, role routing, and handoff boundaries |
| `experiments/context-mode.md` | Experimental external context-pressure tool; not installed or part of the default workflow |

## Runtime Entrypoints And Adapters

| File | Runtime role |
|---|---|
| `../AGENTS.md` | Canonical source of truth for this starter |
| `../CLAUDE.md` | Claude Code thin adapter |
| `.agents/AGENTS.md` | Generated-project Antigravity adapter; not a source-repo path |
| `.agents/skills/*/SKILL.md` | Generated-project Antigravity skills; not source-repo paths |
| `../ANTIGRAVITY.md` | Legacy compatibility or migration note only |

## Workflow Docs

| Area | File |
|---|---|
| Product shape and technology route | `../workflows/product-shape-tech-route.md` |
| Conditional multi-perspective research synthesis | `../workflows/research-synthesis.md` |
| Fullstack product | `../workflows/fullstack.md` |
| UI / UX | `../workflows/ui-ux.md` |
| Validation and release | `../workflows/validation-release.md` |
| Tool selection | `../workflows/tool-routing.md` |
| Tool availability | `tool-registry.md` |
| Tool sources | `../workflows/recommended-tools.md` |
| Presentation | `../workflows/presentation.md` |
| Agent file structure | `../workflows/agent-file-structure.md` |
| macOS build and release | `../workflows/macos-build-release.md` |
| Production agent | `../workflows/production-agent.md` |
| Stage routing | `../workflows/stage-routing.md` |
| AI system design | `../workflows/ai-system-design.md` |
| Screenshot to design system | `../workflows/design-system-from-screenshots.md` |

## Prompts

| File | Runtime |
|---|---|
| `../prompts/codex-new-project.md` | Codex |
| `../prompts/claude-new-project.md` | Claude Code |
| `../prompts/antigravity-new-project.md` | Antigravity |

## Reference

| File | Purpose |
|---|---|
| `../templates/README.md` | Template trigger table |
| `../VALIDATION.md` | Local and CI validation commands |
| `../CONTRIBUTING.md` | Contribution rules |
| `../SECURITY.md` | Security policy |
| `../CODE_OF_CONDUCT.md` | Contributor behavior expectations |
| `../ROADMAP.md` | Public release roadmap |
| `migrations/governseed-brand-transition.md` | Completed repository rename and preserved package, CLI, schema, generator, and configuration identifiers |
| `research/source-adoption-matrix.md` | Exact source revisions, licenses, adopted patterns, rejected scope, and attribution decisions |
| `adr/000-template.md` | ADR template |
| `adr/002-modular-core-and-adapter-boundary.md` | Modular-monolith core and external translation boundary |
| `adr/003-deliberation-and-role-assignment-model.md` | Decision-deliberation and responsibility-assignment contracts |
| `adr/004-risk-to-policy-compiler.md` | Deterministic neutral policy core and Codex project-local Adapter boundary |
| `adr/005-target-materialization-and-attestation-boundary.md` | Project-layer materialization surface and the attestation claim ceiling |
