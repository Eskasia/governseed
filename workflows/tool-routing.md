# Tool Routing

Tool availability, installation status, and fallbacks live in `docs/tool-registry.md`. This file only answers "for this kind of work, which route do I check first".

## Choosing A Tool

| Situation | Primary route | Fallback |
|---|---|---|
| Requirements, terms, or boundaries are unclear | `grill-with-docs` | Fill in `PROJECT_BRIEF.md`, `SPEC.md`, `CONTEXT.md` first |
| Q1-Q9 is done and the first-release product shape and technology route must be decided | `workflows/product-shape-tech-route.md` | Follow `GATE-ROUTE-001` in the generated `AGENTS.md` |
| New feature, bugfix, state flow | `tdd` or a smoke check | Hand-write a minimal regression check |
| Cause of a bug is unknown, tests keep failing | `diagnose` | reproduce / minimise / hypothesise / instrument / fix |
| Unfamiliar repo or module, need the system context first | `zoom-out`; use CodeGraph if `.codegraph/` already exists | `rg`, read files directly, local architecture notes |
| UI direction, state model, or domain flow is uncertain and needs one play-through before real implementation | `prototype` | `UI_SPEC.md` + a static HTML demo |
| Large repo: look up a symbol, route, call graph, or impact | CodeGraph, provided `.codegraph/` exists | `rg`, language server, tests |
| Milestone review, handoff, compressing context | repomix | `OPEN_LOOPS.md`, handoff markdown |
| A common command produces huge output and tokens need compressing: `ls/tree/read/grep/git diff/test/lint/tsc/playwright/docker logs` | RTK: `rtk <command>` | The native command with a narrowed scope |
| Syncing documents when a phase completes | `neat-freak` | Update `OPEN_LOOPS.md` / handoff by hand |
| Long thread, or picking up the next day | `handoff` | `OPEN_LOOPS.md` + a continuation note |
| Long task, large output, context nearly full, cannot resume after compaction | `docs/experiments/context-mode.md` | Read files in small ranges and hand off midway |
| A lesson reusable across projects | LLMwiki | In-project docs or an ad hoc note |
| Unsure where a rule, lesson, or process should be written | `workflows/agent-file-structure.md` | Keep it in `OPEN_LOOPS.md` |
| Conflicting evidence on a decision, a high-impact choice, several credible routes, or an explicit multi-perspective research request | `workflows/research-synthesis.md` | Report the trigger reason code, then create `RESEARCH_SYNTHESIS.md` after the user confirms |
| Papers, literature, citations | `academic-research` | A hand-built source table and citation check |
| Automated testing of a local or preview web UI | Playwright | Browser / Chrome manual QA |
| React/shadcn animated icons, hover/tap micro-interaction | Its Hover, used per `workflows/ui-ux.md` | CSS transition / local component |
| App screenshots to design system to frontend draft | `workflows/design-system-from-screenshots.md` | `DESIGN_SYSTEM.md` |
| Existing UI looks like a template, visually plain, needs anti-slop polish | `design-taste-frontend` | `DESIGN_REVIEW.md` |
| Existing UI needs hierarchy / spacing / styling reworked | `redesign-existing-projects` | `UI_SPEC.md` + focused CSS changes |
| Only need reference images | image generation skill | Browser image search or manual assets |
| Vercel deployment | `vercel-deploy` | Vercel CLI / dashboard |
| macOS app build, signing, TCC, DMG, notarization | `workflows/macos-build-release.md` | The project's own Xcode / build script |
| Production-facing LLM agent, multi-step tool use | `workflows/production-agent.md` | `AGENT_RUNTIME.md` |
| RAG, AI agent, MCP, eval, AI system design | `workflows/ai-system-design.md` | `RAG_DESIGN.md` / `EVAL_PLAN.md` / `AI_SECURITY_REVIEW.md` |
| Reading, producing, or layout-checking a PDF | `pdf` skill | A local PDF library or manual review |
| One-pager, white paper, resume, portfolio, landing page | `kami` | Markdown / HTML artifact |
| Creating or installing a skill | `skill-creator` / `skill-installer` | Manual docs and local scripts |
| PRD, issue, triage, review | `to-prd` / `to-issues` / `triage`; with no issue tracker, use `TASK_CONTRACT.md` | `TASK_CONTRACT.md` |
| Security review, static analysis, dependency risk | `audit-prep-assistant` / `semgrep` / `codeql` | Threat checklist + package audit |
| PPT, presentation, slide deck | `workflows/presentation.md` | Markdown deck / local HTML slides |
| Spans two or more of frontend, backend, DB, security, AI, deployment | The lead agent decides whether to split the work | The main agent breaks it into small steps locally |

## RTK Usage Rules

- RTK is the CLI proxy from `rtk-ai/rtk`; it compresses common shell output before it enters the LLM context. Run `rtk --version` and `rtk gain` first to confirm the installed binary is Rust Token Killer and not the identically named Rust Type Kit.
- Good for: `rtk ls`, `rtk tree`, `rtk read`, `rtk grep`, `rtk git status`, `rtk git diff`, `rtk test <cmd>`, `rtk lint`, `rtk tsc`, `rtk playwright`, `rtk docker logs`.
- Not for: anything needing the full original text, exact line numbers, a complete diff, a complete test log, complete JSON, a complete stack trace, or legal/security evidence preservation. Use the native command with a narrowed scope instead, for example `sed -n '1,160p' file`.
- Do not enable the Claude hook globally in Codex; inside Codex the default is a manual prefix, adding `rtk` only when the output could be large.
- RTK output is only for locating and summarizing; before actually editing a file, still read the relevant source excerpt.
- Afterwards `rtk gain` shows the savings. No tracking data does not mean it cannot be used, only that nothing has accumulated yet.
