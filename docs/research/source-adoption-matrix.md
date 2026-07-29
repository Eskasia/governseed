# Source Adoption Matrix

Date read: 2026-07-29 (Asia/Taipei)

This matrix records decision provenance only. No upstream repository is
vendored, no upstream program is executed, and no source is updated during
normal CLI operation. Exact revisions are pinned so a later review can
distinguish the design studied here from future upstream changes.

## Classification

| Classification | Meaning in this repository |
|---|---|
| `adopt-core` | A neutral rule or data contract implemented in the local deterministic core. |
| `optional-pack` | A separately enabled rules/checks bundle that may add restrictions or checks but cannot grant authority. |
| `adapter-only` | A future thin translation layer outside the core decision rules. |
| `research-only` | Background material that informs design but is not shipped as behavior. |
| `reject` | Explicitly excluded from this product boundary. |

## Locked Sources

| Source | Default branch | Exact commit | License | Mode | Direct code/text reuse | Attribution |
|---|---|---|---|---|---|---|
| [mattpocock/skills](https://github.com/mattpocock/skills) | `main` | [`2ab958093e83e0ec752e6c1c5932da465bf23e0c`](https://github.com/mattpocock/skills/commit/2ab958093e83e0ec752e6c1c5932da465bf23e0c) | MIT, Copyright © 2026 Matt Pocock | metadata and independently rewritten concepts | No | Source citation now; retain the MIT notice if substantial material is copied later. |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | `main` | [`16f29800fd2681bdf24f3eb4ccffe38be3baec6b`](https://github.com/DietrichGebert/ponytail/commit/16f29800fd2681bdf24f3eb4ccffe38be3baec6b) | MIT, Copyright © 2026 DietrichGebert | metadata and independently rewritten concepts | No | Source citation now; retain the MIT notice if substantial material is copied later. |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | `main` | [`aeb42fb354ff4efa36ab475773a082315a3af2ce`](https://github.com/Nutlope/hallmark/commit/aeb42fb354ff4efa36ab475773a082315a3af2ce) | MIT, Copyright © 2026 Hallmark contributors | metadata and independently rewritten concepts | No | Source citation now; retain the MIT notice if substantial material is copied later. |
| [lopopolo/harness-engineering](https://github.com/lopopolo/harness-engineering) | `trunk` | [`226c8d35fb6ea3ed55467753dba6dea2b5fd5778`](https://github.com/lopopolo/harness-engineering/commit/226c8d35fb6ea3ed55467753dba6dea2b5fd5778) | CC BY 4.0 for repository-authored material; see upstream `COPYING.md` for exceptions | adapted concepts | No verbatim reuse | Required; see `THIRD_PARTY_NOTICES.md`. |
| [teddashh/multi-ai-chat-desktop](https://github.com/teddashh/multi-ai-chat-desktop) | `main` | [`70db1cbceb95824f1ac9f3643236c7f60f8c0936`](https://github.com/teddashh/multi-ai-chat-desktop/commit/70db1cbceb95824f1ac9f3643236c7f60f8c0936) | MIT, Copyright © 2026 Ted Huang | metadata and independently designed adapter contract | No | Source citation now; retain the MIT notice if substantial material is copied later. |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | `main` | [`8ef49232e02431f7ca4792b487e5a85a7939ff3a`](https://github.com/msitarzewski/agency-agents/commit/8ef49232e02431f7ca4792b487e5a85a7939ff3a) | MIT, Copyright © 2025 AgentLand Contributors | metadata and independently designed adapter contract | No | Source citation now; preserve the MIT notice and per-file provenance if metadata or persona text is imported later. |

## Capability Decisions

| Source | Capability | Classification | Adopted treatment |
|---|---|---|---|
| mattpocock/skills | Small composable skills; explicit user invocation versus contextual model invocation | `optional-pack` | Packs remain optional, individually versioned, and explicit about invocation mode. |
| mattpocock/skills | Ask one human-decision question at a time; inspect facts available from repository/tools directly | `adopt-core` | CLI reports only questions that cannot be resolved from local governed data. |
| mattpocock/skills | `CONTEXT.md` as glossary; ADR only for hard-to-reverse decisions with real tradeoffs | `adopt-core` | Existing document ownership is preserved; DEC/DLB/ROLE data does not turn `CONTEXT.md` into a scratchpad. |
| mattpocock/skills | Vertical slices, blocking edges, separate Standards and Spec reviews | `optional-pack` | Planned engineering-process Pack only; no issue-tracker dependency in core. |
| mattpocock/skills | Copy the complete skill library or assume subagents/background agents | `reject` | Core contracts are runtime-neutral and do not assume an execution topology. |
| DietrichGebert/ponytail | Minimal-change ladder and smallest owning intervention | `optional-pack` | Future `minimal-change` Pack; acceptance and safety outrank line count. |
| DietrichGebert/ponytail | Trust-boundary validation, data-loss prevention, security, accessibility, explicit requirements, runnable proof | `adopt-core` | These controls cannot be removed by a Pack. |
| DietrichGebert/ponytail | Global hooks, always-on mode, personality, net LOC as primary success metric | `reject` | No global installation, authority expansion, or LOC-based approval. |
| Nutlope/hallmark | `build`, `audit`, `redesign`, and `study`; audit is read-only | `optional-pack` | Future `ui-quality` Pack with explicit verbs and read-only audit default. |
| Nutlope/hallmark | Preserve routes, copy intent, brand, information architecture, and component ownership | `optional-pack` | Redesign checks cannot delete or replace a production route tree by default. |
| Nutlope/hallmark | Responsive, accessibility, token, interaction-state checks and pre-emit critique | `optional-pack` | Mechanical checks receive local versioned codes; subjective critique remains human/model review. |
| Nutlope/hallmark | Theme/personality catalog, fabricated proof, remote study, aesthetic score as doctor truth | `reject` | Not part of base profile or doctor. |
| Harness Engineering | Repository review, context routing, tool legibility, domain ownership, authority, claim-matched proof | `adopt-core` | These principles shape core boundaries and evidence claims. |
| Harness Engineering | Baseline → earliest failed handoff → smallest owning intervention → native verification → fresh rerun → retain/revise/remove | `adopt-core` | Used as the implementation and control-retirement loop. |
| Harness Engineering | Context, Capability, Domain Ownership, Authority, Proof, Feedback/Delivery, Worker Limitation taxonomy | `adopt-core` | Reason codes distinguish missing authority from missing capability or proof. |
| Harness Engineering | Repository-review workflow, carrying cost, and retirement checks | `optional-pack` | Planned future Pack, not Milestone 1 runtime behavior. |
| Harness Engineering | Cases and live evaluator ideas | `research-only` | They do not establish effectiveness for this repository. |
| Harness Engineering | Foreign layouts, fixtures, policies, versions, `sources/raw/`, daemons, hosted evaluators | `reject` | No raw corpus, service, or runtime machinery is copied. |
| multi-ai-chat-desktop | Versioned declarative graph, preflight, role map, multi-round workflow, snapshot, redaction tier, human edit, receipts | `adapter-only` | Neutral deliberation plan/result contracts adopt these data-shape lessons. |
| multi-ai-chat-desktop | Graph-version mismatch blocks replay; accepted/building/ready/failed remain distinct | `adopt-core` | Import is fail-closed and `imported` never means `human-confirmed`. |
| multi-ai-chat-desktop | Stable public programmatic import | `research-only` | No stable public import API was found at the pinned revision; use JSON/file handoff only. |
| multi-ai-chat-desktop | Tauri, WebView, provider login/cookies/sessions, browser automation, provider runtime | `reject` | Remains outside core and outside this repository. |
| agency-agents | Canonical division/role metadata, target conversion, selection, dry-run, local/global distinction, stale-output cleanup, capacity check | `adapter-only` | A future catalog adapter may normalize metadata into the local role-catalog contract. |
| agency-agents | Duplicate normalized ID, revision, license, and per-role hash enforcement | `adopt-core` | Upstream does not provide this complete contract, so the local adapter must fail closed. |
| agency-agents | Complete personas, all-agent installation, NEXUS orchestration, marketplace, auto-update, user-global writes | `reject` | Core retains five governance responsibilities only and never installs an agent. |

## License Boundaries

- No upstream code, prompt body, persona body, theme, screenshot, logo, or raw
  corpus is included in Milestone 1.
- Harness Engineering repository-authored concepts are adapted with attribution.
  `sources/raw/` and third-party quotations, images, embeds, logos, and
  trademarks are excluded.
- A future source update must be an explicit command, show revision and license
  changes, and update a project-local source lock. Normal CLI commands never
  fetch or update an external source.
