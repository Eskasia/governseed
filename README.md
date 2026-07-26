# agent-governance-starter

> Agent-native project governance starter for Codex, Claude Code, and Antigravity.

[![CI](https://github.com/Eskasia/agent-governance-starter/actions/workflows/validate-starter.yml/badge.svg)](https://github.com/Eskasia/agent-governance-starter/actions/workflows/validate-starter.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

`agent-governance-starter` is a governance bootstrap generator. It creates project intake docs, task contracts, runtime entrypoints, and doctor checks before an AI coding agent starts implementation.

It is not a runtime framework, not an app template, not a PRD prompt pack, and not a multi-agent orchestrator.

## 60-second start

```bash
git clone https://github.com/Eskasia/agent-governance-starter.git

node agent-governance-starter/scripts/init.mjs ./my-new-project --agent codex --profile base
node agent-governance-starter/scripts/doctor.mjs ./my-new-project
```

For all supported runtime adapters and the fullstack AI profile:

```bash
node agent-governance-starter/scripts/init.mjs ./my-new-project --agent all --profile fullstack-ai
```

Generated base project tree:

```text
my-new-project/
  README.md
  START_HERE.md
  PROJECT_BRIEF.md
  SPEC.md
  CONTEXT.md
  TASK_CONTRACT.md
  OPEN_LOOPS.md
  TECH_STACK.md
  AGENTS.md
  .agent-governance.json
```

Expected doctor signal on a fresh project:

```text
Project doctor: my-new-project
Profile: base
Required documents:
  OK README.md
  WARN Unfilled template: PROJECT_BRIEF.md
  WARN Unfilled template: SPEC.md
```

Fresh templates produce warnings until the project documents are filled.

## What it generates

| Output | Purpose |
|---|---|
| `README.md` | Generated project entrypoint with read order and doctor command |
| `START_HERE.md` | Read order, Q1-Q9 intake, profile documents, and gate before code |
| `.agent-governance.json` | Machine-readable profile metadata for `doctor` |
| `PROJECT_BRIEF.md`, `SPEC.md`, `CONTEXT.md` | Problem, scope, acceptance criteria, and shared language |
| `TASK_CONTRACT.md`, `OPEN_LOOPS.md`, `TECH_STACK.md` | Executable task plan, unresolved decisions, and verified commands |
| `AGENTS.md` | Canonical project rule source |
| Conditional docs | API, data, env, RAG, eval, AI security, macOS release, tester handoff |
| Runtime adapters | Claude thin adapter and Antigravity `.agents/` skills when requested |

## Supported agents

| Agent | Generated entrypoint | Rule boundary |
|---|---|---|
| Codex | `AGENTS.md` | canonical source of truth |
| Claude Code | `CLAUDE.md` with `@AGENTS.md` | thin adapter only |
| Antigravity | `.agents/AGENTS.md` and `.agents/skills/*/SKILL.md` | thin adapter and skills only |

`ANTIGRAVITY.md` in this source repo is only a compatibility note, not the official generated runtime entrypoint.

## Profiles

| Profile | Copies |
|---|---|
| `base` | Fixed governance documents only |
| `fullstack-ai` | Base plus data, API, env, agent runtime, RAG, eval, and AI security docs |
| `macos` | Base plus macOS release and tester handoff docs |

Profiles live in `profiles/*.json`; scripts read those manifests instead of hardcoding document lists.

## Validation

```bash
npm run check
npm run validate
npm run smoke:base
npm run smoke:fullstack
npm run fixtures
npm run ci
```

In a Git checkout, `npm run validate` and `npm run ci` also require every release artifact to exist in and match `HEAD`; untracked, index-only, staged, or unstaged release-unit drift fails closed.

Fixture examples live under `examples/template-adoption/` and include expected doctor JSON for the base-minimal case.

## Governance Impact

The governance-impact evaluator compares the same committed synthetic task in baseline and governed arms, then applies deterministic oracles and a preregistered evidence gate. Its offline controls verify the harness only; they do not prove that governance improves delivery.

```bash
npm run test:governance-impact
npm run validate:governance-impact
npm run eval:governance
```

See `docs/governance-impact-eval.md` for scenario registration, privacy and containment rules, the fail-closed runtime matrix, paired aggregation, claim thresholds, and non-claims.

## Runtime Proof

Runtime proof commands validate generated Codex, Claude Code, and Antigravity entrypoints in mock mode by default. Local real runtime proof is synthetic-only, explicit, and fails closed when the matching CLI or required safety capability is unavailable. Public CI always stays in mock mode.

```bash
npm run runtime:proof
RUNTIME_PROOF_REAL=1 npm run runtime:proof
```

`npm run runtime:proof:mock` forces mock mode even when the caller's environment contains a real-mode opt-in; public CI uses this command.

## Source repo map

| Path | Purpose |
|---|---|
| `.github/` | CI workflows, issue templates, PR template, and release notes config |
| `AGENTS.md` | Canonical maintenance rules for this starter |
| `docs/runtime-proof.md` | Mock and opt-in real runtime proof contract |
| `docs/governance-impact-eval.md` | Paired evaluator, privacy boundary, evidence gate, and non-claims |
| `startup/00-agent-start-here.md` | Mandatory behavior and reporting format |
| `startup/01-bootstrap-gates.md` | Q1-Q9 intake gates |
| `startup/02-required-project-docs.md` | Fixed and conditional output docs |
| `templates/fixed/` | Always generated governance docs |
| `templates/conditional/` | Profile- or project-type-specific docs |
| `templates/runtime/` | Canonical runtime template material |
| `profiles/` | Profile manifests |
| `schemas/` | JSON Schemas for profile docs and doctor output |
| `scripts/` | `init`, `doctor`, and starter validation |
| `scripts/governance-impact-eval.mjs` | Offline controls and fail-closed paired evaluation CLI |
| `prompts/` | Pasteable first prompts for supported runtime adapters |
| `tests/runtime/` | Runtime proof expected headings, schema, and skill fixture |
| `tests/governance-impact/` | Deterministic scorer, CLI, adapter, and synthetic scenario tests |
| `tests/privacy/` | Negative privacy and unsafe-input regression tests |
| `workflows/` | Human-readable workflow routing |
| `examples/template-adoption/` | Filled fixtures and expected doctor output |

## Community

| Area | Link |
|---|---|
| Issues | `.github/ISSUE_TEMPLATE/` |
| Pull requests | `.github/pull_request_template.md` |
| Security | `SECURITY.md` |
| Contributing | `CONTRIBUTING.md` |
| Code of conduct | `CODE_OF_CONDUCT.md` |
| Release notes | `.github/release.yml` |

## First agent message

Use this after running `init`:

```text
Read START_HERE.md and the runtime entrypoint for this agent. List files read, fixed documents present, conditional documents likely needed, and current blockers. Start Q1-Q9 intake one question at a time. Do not write code until intake, required docs, TASK_CONTRACT.md, and OPEN_LOOPS.md are confirmed.
```

## Public boundaries

- Keep public positioning conservative: this is a governance bootstrap generator.
- Do not add app example code or runtime framework behavior.
- Do not claim external adoption without evidence.
- Do not store secrets, raw tester identifiers, or deployment credentials in generated docs.

## License

MIT - see `LICENSE`.
