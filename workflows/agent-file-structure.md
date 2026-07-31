# Agent File Structure Routing

Purpose: decide where a new rule, lesson, or process belongs, so that everything does not end up in `AGENTS.md` or in the chat log.

## Six Layers

| Layer | Destination | What goes in | What does not |
|---|---|---|---|
| Facts | `LLMwiki` / project docs | Sources, decisions, failure modes, verification commands, project context | Personal tone preferences, one-off operations |
| Memory | `AGENTS.md` | Stable preferences, project rules, prohibitions, common commands, test conventions | Long tutorials, source articles, low-frequency tricks |
| Knowledge | `Skills/` | Weekly-recurring processes, prompts, scripts, templates, matchable trigger conditions | One-off project specs, unverified ideas |
| Guardrails | `Hooks/` | Risks a machine can intercept: dangerous commands, format checks, pre-commit checks, notifications, cleanup | Product decisions that need human judgment |
| Delegation | `Subagents/` | Roles that need their own context: reviewer, test-runner, security review, document tidying | Control of the main flow, ownership of shared files |
| Distribution | `Plugins/` | Skills, rules, subagents, and toolkits that must install consistently across a team | Personal experiments, workflows that are not yet stable |

## Routing A Durable Rule Proposal

Run this routing only when the work produces a proposal for a new rule, preference, or recurring process worth keeping long-term; ordinary phase or milestone wrap-up does not require the ceremony. When proposing, ask in order:

1. Is the new knowledge a fact or a preference?
2. Will it be reused next time?
3. Can a script or hook check it automatically?
4. Does it need a separate role to handle it?
5. Is it worth syncing across projects or teams?

## Writing Rules

- Facts and sources: write them into `LLMwiki` or the project docs.
- Stable preferences and project rules: write them into `AGENTS.md`.
- Recurring processes: extract a `Skills/` entry, use it locally first, and only consider distribution once it is stable.
- Mistakes a machine can intercept: put them in `Hooks/`, not in verbal reminders.
- Work that needs an isolated context: create a `Subagents/` role, but the main agent keeps integration and acceptance.
- Only promote to `Plugins/` when a team must use it consistently.

## When Not To Promote

- Doing something once does not make it a skill.
- Being reminded once does not make it an `AGENTS.md` rule.
- Something that still needs human judgment does not become a hook.
- Something not yet proven useful in 2 or more projects does not become a plugin.
- If a section of project docs solves it, do not start a new toolchain.

## Minimum Record

Only when a durable rule proposal is adopted, record the selected destination, the canonical owner, and the adoption evidence; with no proposal, there is no need to report on all seven destinations one by one.
