# UI UX Workflow

## Four Layers Of UI Tool Choice

| Situation | Use | Output |
|---|---|---|
| Direction is uncertain, need to see the look first | Open Design | disposable prototype / HTML demo |
| UI direction, interaction flow, state model, or data model is still uncertain | `prototype` | A throwaway interactive prototype, UI variants, or a terminal state-model demo |
| Need to settle the product type, design system, palette, typography, layout | `ui-ux-pro-max` | The design direction in UI_SPEC |
| There are screenshots, generated UI, or an existing app, and a deliverable design system, mockups, assets, or an interactive draft must be derived from it | `workflows/design-system-from-screenshots.md` + `ui-ux-pro-max` | DESIGN_SYSTEM, screen map, assets manifest, side-by-side critique |
| The screens run but look like an AI template, too plain | `design-taste-frontend` | An anti-slop redesign direction |
| The visual direction is set and stronger frontend taste rules are needed | Taste Skill variants | High-quality UI language, motion, density, and layout constraints |
| Before launch or before letting people try it | `impeccable audit/polish` | DESIGN_REVIEW |

## UI_SPEC Required Fields

- register: brand/marketing or product/app.
- Usage context: who uses it, on what device, under what pressure.
- Main flows: at most 3 core paths.
- Core screens: pages, main components, data density.
- States: loading, empty, error, disabled, focus, hover/tap.
- Responsive: mobile, tablet, desktop.
- Design sources: Open Design, awesome-design-md, shadcn/ui, React Bits, Uiverse, Its Hover.
- Explicitly unwanted: template feel, excessive cards, AI purple-blue gradients, meaningless animation, unreadable icons.

## AI Frontend App Building Loop

- If the goal is only to explore a direction, build a `prototype` first; once a direction is chosen, return to the real repo to implement it and do not treat the prototype as production code.
- Whenever the task is a website, dashboard, prototype, interactive tool, or a first draft of a mobile/native app, establish a visual target first: a screenshot, wireframe, generated UI, or an explicit design spec.
- When Codex implements, treat the visual target as a specification, not just inspiration; where needed, look up a real data source or label the data as demo data.
- When done, take Browser/Chrome screenshots and do a side-by-side critique against the original visual target.
- Sort the differences into layout, spacing, typography, color, assets, interaction, and data realism, then fix them one by one.
- Do not deliver only a static mockup; at minimum, the operable states of the core flow must work.

## Taste Skill Routing

| Situation | Use |
|---|---|
| General frontend anti-slop; layout / typography / spacing / motion reinforcement | `design-taste-frontend` |
| A Codex / GPT task needing stronger layout variance, GSAP, motion, and taste constraints | `gpt-taste` |
| There is a screenshot or generated image, going image -> analyze -> code | `image-to-code` |
| An existing project needs an audit first, then a rework of layout, spacing, hierarchy, styling | `redesign-existing-projects` |
| A high-end, quiet, premium direction is already settled | `high-end-visual-design` |
| An editorial / Notion / Linear style clean product direction is already settled | `minimalist-ui` |
| A Swiss / industrial / brutalist direction is already settled | `industrial-brutalist-ui` |
| Only reference images are needed, no code | `imagegen-frontend-web`, `imagegen-frontend-mobile`, `brandkit` |

Usage rules:

- Do not enable multiple taste variants at once; use `UI_SPEC.md` or `DESIGN_SYSTEM.md` to settle one main direction first.
- Image generation skills only produce reference images; implementation still returns to Codex + a Browser side-by-side critique.
- `full-output-enforcement` is only for when an agent keeps emitting half-finished output or placeholders; it is not the UI default.

## Deriving A Design System From Screenshots

- Whenever the user supplies app screenshots, generated UI, an existing UI, or competitor screens and asks for a design system, mockups, design tokens, icons, background assets, or a frontend draft, read `workflows/design-system-from-screenshots.md`.
- Produce `DESIGN_SYSTEM.md` first; do not redraw the UI straight away.
- The system must derive concrete rules from the screenshots and point out inconsistencies; every rule states when it applies and how not to use it.
- Mockups must cover every tab, modal, and core state; assets go into `assets/` or the project's existing static asset directory, with a manifest.

## GitHub Starred UI Reinforcement

- `Leonxlnx/taste-skill`: a collection of frontend anti-slop, image-to-code, redesign, and brand/web/mobile reference-image skills; pick a single variant using the routing above.
- `VoltAgent/awesome-design-md`: use it to build a `DESIGN.md` or a design language reference.
- `DavidHDev/react-bits`: reference for landing pages, showcase pages, interactive effects.
- `uiverse-io/galaxy`: reference for small CSS/Tailwind components.
- `itshover/itshover`: animated icon / micro-interaction reference; suits Next.js, shadcn, React UI when hover/tap icon motion needs to be intentional.
- `shadcn-ui/ui`: the base for real app components, but customize per UI_SPEC rather than applying defaults.

## Its Hover Usage Rules

- Site: https://www.itshover.com
- GitHub: https://github.com/itshover/itshover
- shadcn registry install format: `npx shadcn@latest add https://itshover.com/r/[icon-name].json`
- Manual installation needs `motion`: `npm install motion`
- Use it only where icon motion helps identify a state or an intended action; do not animate every icon for decoration.
- Before using, check whether the project already uses shadcn/ui, Tailwind, React/Next.js, and whether a `motion/react` dependency is acceptable.
- After implementing, check keyboard focus, reduced motion, and mobile tap feedback; it must not only be understandable on hover.

## DESIGN_REVIEW Required Fields

- Chrome desktop/mobile checked.
- Console errors checked.
- Core flow clicked through.
- loading/empty/error/disabled/focus covered.
- No text overflow, overlap, or obstruction.
- Does the visual still look like an AI template: yes/no, with a reason.
- If there was an original screenshot or generated UI, the side-by-side critique is done and the design differences are recorded.
