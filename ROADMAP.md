# GovernSeed Roadmap

## v1 Public Release

- Keep GovernSeed positioned clearly as project governance infrastructure for Codex, Claude Code, and Antigravity.
- Maintain `AGENTS.md` as the canonical source of truth.
- Keep `CLAUDE.md` as a thin adapter.
- Keep generated Antigravity output under `.agents/AGENTS.md` and `.agents/skills/*/SKILL.md`.
- Keep top-level `ANTIGRAVITY.md` limited to a legacy compatibility or migration note.
- Keep `scripts/init.mjs`, `scripts/doctor.mjs`, and `scripts/validate-starter.mjs` covered by CI smoke checks.
- Keep examples filled enough to pass strict doctor checks.
- Keep every capability-matrix citation backed by a pinned official sentence that is re-verified, so the evidence stays live rather than becoming a dated snapshot.

## Agent Runtime Refinement

- Improve generated runtime prompts after real usage shows repeated gaps.
- Add only stable workflow rules to root files; project-specific rules belong in generated project docs.
- Keep Antigravity guidance executable without assuming Codex-specific skills.

## Examples Expansion

- Done: UI-heavy fixture `examples/template-adoption/ui-dashboard-redesign`.
- Done: production agent fixture `examples/template-adoption/production-agent-triage`.
- Done: one-pager fixture `examples/template-adoption/launch-one-pager`.
- Keep all example data synthetic and privacy-safe.
- Add a fixture only when it exercises a template combination no existing
  fixture covers; register it in `scripts/fixtures-check.mjs` and the examples
  README table.

## Proposed: Cross-Agent Project Workbench

Status: design proposal only — not current functionality or a release
commitment. See `docs/experiments/cross-agent-project-workbench.md`.

- Preserve local Markdown, closed JSON contracts, and Git history as the
  canonical project state.
- Add an adaptive PRD layer without duplicating simple projects' existing brief
  and spec.
- Make mid-project ideas first-class change records with impact review, an
  explicit accept/defer/reject decision, and requirement/task/evidence lineage.
- Let Codex, Claude Code, Antigravity, and future adapters consume the same
  project state without owning separate truth.
- Add a portable, advisory personalization layer that cannot weaken project
  gates.
- Evaluate a pinned, curated role catalog for advisory team plans; keep user
  confirmation and one main integration owner.
- Prove the local CLI/file protocol before considering a dashboard or runtime
  orchestration.

Implementation requires a separately approved architecture decision, public
contract, migration plan, security review, and test/evidence plan.

## Out of Scope

- No claims of external adoption without evidence.
- No root `codex_mvp_prd_pack.md`.
- No bundled secrets, generated app code, or deployment credentials.
- No automatic agent spawning, scheduling, or global third-party role
  installation in the proposed V1.
- No unreviewed upstream prompt bodies and no role text that can override
  canonical project rules.
