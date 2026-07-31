# DESIGN_SYSTEM.md

## Product Judgment

- Product character: quiet, dense, scannable; a tool rather than a showpiece
- Target users: dispatchers and on-duty support staff
- Core usage scenarios: forty minutes or more of continuous operation during a peak shift
- Devices and usage pressure: fixed dual-monitor workstation, high time pressure, high cost of misreading
- Screenshots / reference sources: composite screenshot samples of the existing dispatch queue, order detail, and exception list screens

## Visual Language Extraction

| Category | Rule observed in screenshots | When to use | How not to use | Inconsistencies |
|---|---|---|---|---|
| Color | Status uses three hues only: neutral, warning, danger | Status badges and row backgrounds | Do not express priority with hue | The exception list warning is orange, the queue is yellow |
| Typography | One sans-serif family, three sizes | Site-wide | Do not introduce a second family | Order detail uses a larger heading size |
| Spacing | 8px base unit, 40px table row height | Tables and forms | Do not use off-multiple values like 5px or 7px | The exception list row height is 36px |
| Grid | 12 columns, 24px gutters on desktop | Page frame | Do not build an equal-width three-column card wall | Order detail does not apply the page gutter |
| Corner radius | A single 4px value | Buttons, inputs, badges | Do not use pill-shaped badges | Exception list badges are pill-shaped |
| Border | 1px neutral, separators only | Table rows, panels | Do not express status with a border | The queue expresses exceptions with border color |
| Shadow | Overlays only, one level | Drawer, Modal, Toast | Do not add shadow to static cards | Order detail cards carry a shadow |
| Components | The table row is the unit of action, inline actions right-aligned | Queue | Do not hide the primary action in a kebab menu | The exception list primary action is inside a kebab |
| Interaction states | hover changes background only, never text color | Every clickable row | Do not use an underline for hover | Order detail hover changes text color |
| Icons / illustration | Line icons only, no illustration | Action buttons | Do not fill empty states with illustration | An illustration appeared once in an empty state |

## Design Principles

| Principle | When to use | How not to use |
|---|---|---|
| One status uses one token set site-wide | Everywhere an order status is shown | Do not change color per screen |
| Density over whitespace | Queue and lists | Do not cut visible rows for breathing room |
| Scannability over readability | Table columns | Do not replace short labels with long sentences |
| Errors never cover existing data | Claim failure | Do not report errors in a full-page modal |

## Color System

| Token | Value | Purpose | When to use | How not to use |
|---|---|---|---|---|
| `--color-bg` | `#F7F8FA` | Page background | Every page frame | Not as a card background |
| `--color-surface` | `#FFFFFF` | Panel and row hover background | Tables, Drawer | Not as a page background |
| `--color-text` | `#16191F` | Primary text | Body copy and field values | Not for secondary notes |
| `--color-muted` | `#5B6472` | Secondary text | Field labels, timestamps | Not for primary values |
| `--color-border` | `#DDE1E7` | Separators | Table rows, panel edges | Not to express status |
| `--color-primary` | `#1F5FD0` | Primary action and focus ring | Primary buttons, focus | Not for status badges |
| `--color-success` | `#1E7A4B` | Completed status | Status badges | Not beyond ordinary success feedback |
| `--color-warning` | `#A9640A` | Needs-attention status | Status badges, warning bars | Do not add a second orange scale |
| `--color-danger` | `#B3261E` | Exception status | Status badges, error bars | Not for destructive hints other than delete |

## Typography System

| Token | Value | Purpose | When to use | How not to use |
|---|---|---|---|---|
| `--font-display` | Same family as `--font-sans`, weight 600 | Screen titles | Page header, Drawer title | Do not introduce a second family |
| `--font-sans` | System sans-serif stack | Body copy and tables | Site-wide default | Not for numeric alignment columns |
| `--font-mono` | System monospace stack | Order numbers and timestamps | Columns that must align | Not for ordinary body copy |

## Spacing And Grid

| Token / Rule | Value | When to use | How not to use |
|---|---|---|---|
| Base unit | 8px | Site-wide | No values off a multiple of 4 |
| Page padding | 24px | Desktop page frame | Do not vary per screen |
| Section gap | 24px | Between sections | Not between table rows |
| Component gap | 8px | Button groups, badge groups | Not between sections |
| Form gap | 16px | Between form fields | Do not compress to 8px |
| Modal padding | 24px | Drawer and Modal | Never below 16px |
| Breakpoints | 768px / 1024px | Responsive switching | Do not add an intermediate breakpoint |

## Radius, Border, Shadow

| Token | Value | When to use | How not to use |
|---|---|---|---|
| `--radius-sm` | `4px` | Buttons, inputs, badges | Do not make pill shapes |
| `--radius-md` | `6px` | Panels, Drawer | Not for inline elements |
| `--radius-lg` | `8px` | Full-page Modal | Not for tables |
| `--shadow-sm` | `0 1px 2px rgba(22, 25, 31, 0.08)` | Toast | Not for static cards |
| `--shadow-md` | `0 8px 24px rgba(22, 25, 31, 0.12)` | Drawer, Modal | Do not stack two shadow layers |

## Core Component Specs

| Component | Structure | States | When to use | How not to use |
|---|---|---|---|---|
| Button | Label plus optional leading icon | default / hover / focus / disabled / loading | Primary and secondary actions | Do not use an icon-only primary action |
| Input | Label above, helper text below | default / focus / error / disabled | Forms and filters | Do not replace the label with a placeholder |
| Select | Native dropdown with a custom arrow | default / focus / disabled | Filtering and reassignment | Do not build nested multi-level menus |
| Tabs | Underline indicator, at most four items | default / active / focus | Order detail tabs | Do not carry primary navigation in tabs |
| Sidebar / Navbar | Fixed left navigation, 216px wide | default / active | Site-wide | Do not add a collapse animation |
| Card / Panel | White background, 1px border, no shadow | default | Order detail sections | Do not use shadow to create depth |
| Table / List | 40px row height, sticky header | default / hover / selected / empty | Queue and exception list | Do not use zebra striping |
| Modal / Drawer | Right-side Drawer by default, Modal for confirmation only | default / loading | Order actions | Do not show long forms in a Modal |
| Toast / Alert | Bottom-right Toast, auto-dismiss after four seconds | success / warning / danger | Action results | Do not report blocking errors in a Toast |
| Empty / Error / Loading | Text plus a single action | one of each of the three | Every list | Do not use illustration or a spinner overlay |

## State Specs

| State | Visual rule | When to use | How not to use |
|---|---|---|---|
| default | `--color-surface` background, `--color-text` text | Every component | Do not add an extra border |
| hover | Background switches to `--color-surface`, text color unchanged | Clickable rows and buttons | Do not change text color or add an underline |
| active | Background one step darker | Button press | Do not use a shift animation |
| focus | 2px `--color-primary` focus ring | Keyboard navigation | Do not remove the outline |
| disabled | Opacity 0.45, not-allowed cursor | Unauthorized actions | Do not hide the control outright |
| loading | Skeleton preserves column widths | Lists and panels | Do not use a full-page overlay |
| selected | 3px `--color-primary` marker on the left | Bulk-selected rows | Do not recolor the whole row |
| error | Inline error bar with retry | Claim or submit failure | Do not block data with a Modal |
| success | Toast feedback, row style unchanged | Successful action | Do not leave a persistent green background |
| empty | State the current filter plus clear-filter | Filter returns nothing | Do not use illustration |

## Icon / Illustration Specs

- Icon size: 16px inline, 20px in buttons
- Stroke width: 1.5px
- Fill: no fill, stroke only, color inherits the text color
- Background: transparent
- Naming: `icon-<action-or-object>`, all lowercase with hyphens
- When to use: action buttons, leading status markers
- How not to use: do not express status with an icon alone, do not use illustration

## Copy Tone Specs

| Scenario | Tone | Example | How not to write |
|---|---|---|---|
| Button | Verb first, at most four words | Reassign, Flag exception | "Are you sure you want to reassign?" |
| Error | State what happened and the next step | Claim failed, please retry | "An unknown error occurred" |
| Empty state | State the current filter | No pending orders match the current filter | "It's empty in here!" |
| Success | State the result | Reassigned 3 orders | "Awesome!" |
| Helper text | State the limit | Notes are limited to 200 characters | "Please keep it short" |

## Forbidden Rules / Design Red Lines

| Rule | Reason | When to use | How not to use |
|---|---|---|---|
| Never write a color, spacing, or radius value that is not a token | Once values scatter, the screens diverge again | Every screen | Do not make an exception because "it is only this one place" |
| One status must not change color across screens | Misreading is expensive | Status badges | Do not adjust a status color for visual variety |
| Never express status with border color | The existing screens are already inconsistent because of this | Table rows | Do not reinforce a badge with a border |
| Errors must never cover existing data | On-duty work needs the context kept | Claim failure | Do not use a full-page Modal |

## Screen Map

| Screen / Tab / Modal | Entry point | Primary action | Required states | Notes |
|---|---|---|---|---|
| Dispatch queue | Side navigation | Filter, bulk reassign | loading / empty / error | At least 25 rows per desktop viewport |
| Single order Drawer | Click a queue row | Reassign, flag exception, write a note | loading / error | Do not use a Modal |
| Exception list | Side navigation | Claim, record outcome | loading / empty / error | Shares status tokens with the queue |
| Confirmation Modal | Destructive actions | Confirm, cancel | loading | Confirmation only |

## Component Inventory

| Component | Screens used on | Token dependencies | Asset dependencies | Frontend notes |
|---|---|---|---|---|
| Table | Dispatch queue, exception list | `--color-border`, `--space-2` | None | Sticky header |
| Status Badge | All three screens | `--color-success`, `--color-warning`, `--color-danger` | None | The status mapping lives in the color system |
| Drawer | Single order | `--shadow-md`, `--radius-md` | None | Fixed 480px width on the right |
| Toast | All three screens | `--shadow-sm`, `--radius-sm` | None | Auto-dismiss after four seconds |
| Empty State | Queue, exception list | `--color-muted` | None | Text only, no illustration |

## Asset Manifest

| File | Purpose | Size | Transparent background | Source prompt / source | Screens used on |
|---|---|---|---|---|---|
| `icon-reassign.svg` | Reassign action | 20×20 | yes | Drawn in-project, 1.5px stroke | Dispatch queue, single order |
| `icon-flag.svg` | Flag exception | 20×20 | yes | Drawn in-project, 1.5px stroke | Single order |
| `icon-claim.svg` | Claim exception | 20×20 | yes | Drawn in-project, 1.5px stroke | Exception list |

## Design Tokens

```css
:root {
  --color-bg: #F7F8FA;
  --color-surface: #FFFFFF;
  --color-text: #16191F;
  --color-muted: #5B6472;
  --color-border: #DDE1E7;
  --color-primary: #1F5FD0;
  --color-primary-fg: #FFFFFF;
  --color-success: #1E7A4B;
  --color-warning: #A9640A;
  --color-danger: #B3261E;

  --font-display: var(--font-sans);
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --shadow-sm: 0 1px 2px rgba(22, 25, 31, 0.08);
  --shadow-md: 0 8px 24px rgba(22, 25, 31, 0.12);
}
```

```js
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
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
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
