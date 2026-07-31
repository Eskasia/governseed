# Recommended Tools

Recommended skills and tool sources, selected by trigger condition.

## Core Skill Sources

| Source repo | Category | Recommended install | Notes |
|---|---|---|---|
| `openai/skills` | Official Codex skills | OpenAI docs, Playwright, PDF, Vercel deploy, skill creator, CLI creator | No need to install everything |
| `mattpocock/skills` | Engineering workflow | grill-with-docs, tdd, diagnose, prototype, zoom-out, handoff, neat-freak | Install as needed |
| `trailofbits/skills` | Security review | audit prep, differential review, semgrep, codeql, supply chain | Install when there is a security need |
| `Leonxlnx/taste-skill` | UI/UX taste | design-taste-frontend, image-to-code, redesign | Pick the variant that matches the UI direction |
| `voidful/academic-skills` | Academic research | academic-research | Install for academic tasks |
| `op7418/guizang-ppt-skill` | Presentations | guizang-ppt-skill | For HTML web decks |
| `tw93/Kami` | Document layout | kami | one-pager, resume, portfolio, landing page |

## UI / Frontend Reinforcement

| Repo | Trigger | Use |
|---|---|---|
| `nextlevelbuilder/ui-ux-pro-max-skill` | A design-system direction is needed | Design system generation |
| `pbakaus/impeccable` | UI acceptance before launch | audit / polish |
| `nexu-io/open-design` | Direction is uncertain, a prototype is needed | Disposable prototype |
| `VoltAgent/awesome-design-md` | A DESIGN.md or brand design language is needed | Design document reference |
| `DavidHDev/react-bits` | High-quality React components are needed | Animation / showcase reference |
| `uiverse-io/galaxy` | Small CSS/Tailwind components are needed | UI inspiration |
| `itshover/itshover` | Animated icons are needed | hover/tap micro-interaction |
| `shadcn-ui/ui` | Maintainable app components are needed | Customize per UI_SPEC |

## Engineering / Knowledge Management

| Repo | Trigger | Use |
|---|---|---|
| `colbymchenry/codegraph` | A large repo needs structural understanding | symbol / call graph queries |
| `rtk-ai/rtk` | Common CLI output is too large, token pressure is high | `rtk ls/read/grep/git diff/test/lint/tsc/playwright` compresses output; inside Codex use a manual prefix |
| `sdyckjq-lab/llm-wiki-skill` | Cross-project knowledge needs to accumulate | Processes, failure modes, verification commands |
| `docling-project/docling` | Documents need converting to Markdown/JSON | PDF / Office conversion |
| `opendatalab/MinerU` | Complex PDF / Office parsing | Structured document extraction |
| `addyosmani/agent-skills` | Engineering-quality skill reference | Not installed directly; used as a design reference |

## Architecture / AI System Reference

| Repo | Trigger | Use |
|---|---|---|
| `humanlayer/12-factor-agents` | Production agent design | Already distilled into `workflows/production-agent.md` |
| `ombharatiya/ai-system-design-guide` | AI system design | Already distilled into `workflows/ai-system-design.md` |
| `microsoft/ai-agents-for-beginners` | Learning agent architecture | Teaching reference, not part of the flow |
| `emcie-co/parlant` | Customer-support AI / controlled responses | Architecture reference |
| `ashishps1/awesome-system-design-resources` | System architecture design | Pre-ADR reference |

## Security

| Repo | Trigger | Use |
|---|---|---|
| `projectdiscovery/nuclei` | Security smoke before launch | Only against URLs you own |

## Specialist Domains

| Repo | Trigger | Use |
|---|---|---|
| `aklofas/kicad-happy` | EDA / PCB / KiCad work | The full set of 12 electronics skills |

## Installation Principles

- Do not bulk-install any skill collection; install per task need.
- Specialist-domain skills stay dormant and activate only for the matching task.
- Versions, prices, model rankings, and similar figures must be looked up live, never taken from static values in a document.
- Context/token relief tools such as `mksglu/context-mode` are used experimentally first; see `docs/experiments/context-mode.md`.
- RTK is a CLI tool, not a Codex skill to bulk-install; unless you are developing RTK itself, do not install the Rust/TDD/PR-triage skills inside its repo.
