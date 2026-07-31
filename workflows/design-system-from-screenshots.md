# Design System From Screenshots

Purpose: when app screenshots, generated UI, an existing UI, or competitor screens already exist, derive a workable design system from the screens first, then produce consistent UI mockups, image assets, or a frontend app draft.

## Triggers

- The user supplies screenshots and asks to "write up the design system from the current interface".
- The user supplies generated UI or mockups and asks Codex to turn them into an interactive frontend.
- An existing app's style must be handed to a designer, a frontend developer, or another agent to continue.
- Tabs, modals, state pages, empty states, and error states must be filled in completely.
- Icons, background images, illustrations, and similar assets must be generated and saved into the project's `assets/` or existing static asset directory.

Does not apply when: there is only a one-line product concept and no screenshots or existing visual reference; in that case start with UI_SPEC and the Open Design prototype in `workflows/ui-ux.md`.

## Tool Routing

| Stage | Tool / skill | Output |
|---|---|---|
| Screenshot analysis, product character assessment, design system rules | `ui-ux-pro-max` | `DESIGN_SYSTEM.md` |
| Avoiding AI template feel, fixing visual consistency | `design-taste-frontend` or the matching Taste Skill variant | design critique / polish direction |
| A visual prototype before real frontend work | Open Design / Figma / HTML prototype | A design preview URL or local HTML |
| Building an interactive app draft from the visual target | `image-to-code` / Codex + Build Web Apps / Browser | Implemented app, Browser screenshots, side-by-side critique |
| Generating transparent-background icons, background images, illustrations | image generation / local asset pipeline | `assets/icons/*.png`, `assets/images/*.png` |
| Pre-launch acceptance | Browser / Chrome / `impeccable` | `DESIGN_REVIEW.md` |

## The Staged Flow

1. Extract the rules first: from the screenshots or generated UI, derive the product character, users, scenarios, visual language, and inconsistencies. Do not redraw yet.
2. Then produce the mockups: use `DESIGN_SYSTEM.md` to fill in every tab, modal, state, and core flow.
3. Then implement an interactive draft: Codex treats the visual target as a specification, looking up real data where needed or labeling demo data.
4. Then review: take Browser screenshots, do a side-by-side critique against the original visual target, list the differences, and fix them.
5. Produce assets only when needed: export files only for the icons, background images, and illustrations the mockups actually use, save them under `assets/`, and create an asset manifest.

## DESIGN_SYSTEM.md Required Fields

Every section must state when it applies and how not to use it.

- Product character: business, tool, creative, social, content, finance, healthcare, education, games, and so on; say why.
- Target users: role, proficiency, pressure while using it, device.
- Core scenarios: high-frequency tasks, low-frequency but high-risk tasks, browsing versus operating.
- Visual language: color, typography, spacing, grid, corner radius, borders, shadows, icons, illustration, motion, interaction states.
- Design principles: 3-7 of them, each able to guide a tradeoff.
- Color system: background, foreground, primary, secondary, accent, muted, border, success, warning, danger, info.
- Type system: display, heading, body, label, caption, number/code; including weight, line height, and usage limits.
- Spacing and grid: base unit, section gap, component gap, form gap, modal padding, mobile/desktop breakpoints.
- Radius, borders, shadows: tokens, levels, usage limits.
- Core components: button, input, select, tabs, sidebar/navbar, card/table/list, modal/drawer, toast, empty/error/loading.
- State rules: default, hover, active, focus, disabled, loading, selected, error, success, empty.
- Icon / illustration rules: size, stroke width, fill, transparent background, naming, no mixing styles.
- Copy tone: buttons, errors, empty states, hints, success messages.
- Prohibitions / design red lines: derived from the screenshot problems and the product character, not generalities.
- Current inconsistencies: list, item by item, the inconsistent colors, spacing, radii, type sizes, icons, states, or component behaviors in the screenshots.
- Design tokens: provide CSS variables; if the project uses Tailwind, also provide the matching `theme.extend`.

## Mockup Requirements

- First list the whole screen map to cover: every tab, modal, drawer, settings page, empty state, error state, loading, success.
- Mockups must use the tokens in `DESIGN_SYSTEM.md`; no new undocumented colors, type sizes, radii, or shadows.
- Every screen is annotated with: purpose, entry point, main actions, states, responsive requirements.
- When a designer takes over, prefer a Figma / Open Design / HTML preview; when a frontend developer takes over, attach a component inventory.
- If a mockup conflicts with the screenshots' style, update the rule in `DESIGN_SYSTEM.md` or record it as an open question; do not change it on instinct.

## Frontend Implementation And Review Requirements

- Before implementing, name the visual target's path or source explicitly: screenshot, generated UI, Figma, Open Design, or HTML prototype.
- When using a Taste Skill, pick one main variant: `design-taste-frontend` for general anti-slop, `image-to-code` for image-first, `redesign-existing-projects` for reworking an existing project. Do not mix conflicting style skills.
- Codex must not treat the visual target as mere inspiration; layout, spacing, typography, color, assets, and interaction must all be comparable against it.
- Where realism matters, the data must come from a real source, a fixture, or clearly labeled demo data.
- When done, take Browser/Chrome screenshots and do a side-by-side critique against the original visual target.
- The critique is split into layout, spacing, typography, color, assets, interaction, and data realism.
- After fixing, update `DESIGN_REVIEW.md` with what was fixed and what differences were kept.

## Asset Requirements

- When only reference images are needed rather than code, use `imagegen-frontend-web`, `imagegen-frontend-mobile`, or `brandkit`; afterwards hand the images to the implementation flow as the visual target.
- Icons must be transparent-background PNGs, one file per icon.
- Background images, illustrations, and empty-state art go into directories by purpose: `assets/icons/`, `assets/images/`, `assets/illustrations/`.
- If the project already has a static asset convention, such as `public/assets/` or `src/assets/`, follow it.
- File names use kebab-case and include purpose and state, for example `ticket-empty-state.png`, `icon-ticket-open.png`.
- Produce `assets/ASSET_MANIFEST.md` recording the file name, purpose, size, transparent background, source prompt, and the screen that uses it.
- Do not generate decorative assets that appear in neither the screen map nor the component inventory.

## Design Tokens Template

```css
:root {
  --color-bg: ;
  --color-surface: ;
  --color-text: ;
  --color-muted: ;
  --color-border: ;
  --color-primary: ;
  --color-primary-fg: ;
  --color-success: ;
  --color-warning: ;
  --color-danger: ;

  --font-display: ;
  --font-sans: ;
  --font-mono: ;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: ;
  --radius-md: ;
  --radius-lg: ;
  --shadow-sm: ;
  --shadow-md: ;
}
```

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        text: 'var(--color-text)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        primary: 'var(--color-primary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
      },
    },
  },
};
```

## Acceptance

- Every rule in `DESIGN_SYSTEM.md` states when it applies and how not to use it.
- Every conclusion traces back to a screenshot, the existing UI, or an explicit product judgment.
- The current app's design inconsistencies are listed explicitly.
- The UI mockups cover every tab, modal, and core state.
- Assets under `assets/` have a manifest, and icons are transparent-background PNGs with one icon per file.
- Browser/Chrome has checked desktop/mobile, text overflow, image loading, and console errors.
- If frontend implementation has started, the Browser screenshots and the original visual target have had a side-by-side critique.
