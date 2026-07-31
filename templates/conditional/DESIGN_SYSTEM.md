# DESIGN_SYSTEM.md

## Product Judgment

- Product character:
- Target users:
- Core usage scenarios:
- Devices and usage pressure:
- Screenshots / reference sources:

## Visual Language Extraction

| Category | Rule observed in screenshots | When to use | How not to use | Inconsistencies |
|---|---|---|---|---|
| Color |  |  |  |  |
| Typography |  |  |  |  |
| Spacing |  |  |  |  |
| Grid |  |  |  |  |
| Corner radius |  |  |  |  |
| Border |  |  |  |  |
| Shadow |  |  |  |  |
| Components |  |  |  |  |
| Interaction states |  |  |  |  |
| Icons / illustration |  |  |  |  |

## Design Principles

| Principle | When to use | How not to use |
|---|---|---|
|  |  |  |

## Color System

| Token | Value | Purpose | When to use | How not to use |
|---|---|---|---|---|
| `--color-bg` |  |  |  |  |
| `--color-surface` |  |  |  |  |
| `--color-text` |  |  |  |  |
| `--color-muted` |  |  |  |  |
| `--color-border` |  |  |  |  |
| `--color-primary` |  |  |  |  |
| `--color-success` |  |  |  |  |
| `--color-warning` |  |  |  |  |
| `--color-danger` |  |  |  |  |

## Typography System

| Token | Value | Purpose | When to use | How not to use |
|---|---|---|---|---|
| `--font-display` |  |  |  |  |
| `--font-sans` |  |  |  |  |
| `--font-mono` |  |  |  |  |

## Spacing And Grid

| Token / Rule | Value | When to use | How not to use |
|---|---|---|---|
| Base unit |  |  |  |
| Page padding |  |  |  |
| Section gap |  |  |  |
| Component gap |  |  |  |
| Form gap |  |  |  |
| Modal padding |  |  |  |
| Breakpoints |  |  |  |

## Radius, Border, Shadow

| Token | Value | When to use | How not to use |
|---|---|---|---|
| `--radius-sm` |  |  |  |
| `--radius-md` |  |  |  |
| `--radius-lg` |  |  |  |
| `--shadow-sm` |  |  |  |
| `--shadow-md` |  |  |  |

## Core Component Specs

| Component | Structure | States | When to use | How not to use |
|---|---|---|---|---|
| Button |  |  |  |  |
| Input |  |  |  |  |
| Select |  |  |  |  |
| Tabs |  |  |  |  |
| Sidebar / Navbar |  |  |  |  |
| Card / Panel |  |  |  |  |
| Table / List |  |  |  |  |
| Modal / Drawer |  |  |  |  |
| Toast / Alert |  |  |  |  |
| Empty / Error / Loading |  |  |  |  |

## State Specs

| State | Visual rule | When to use | How not to use |
|---|---|---|---|
| default |  |  |  |
| hover |  |  |  |
| active |  |  |  |
| focus |  |  |  |
| disabled |  |  |  |
| loading |  |  |  |
| selected |  |  |  |
| error |  |  |  |
| success |  |  |  |
| empty |  |  |  |

## Icon / Illustration Specs

- Icon size:
- Stroke width:
- Fill:
- Background:
- Naming:
- When to use:
- How not to use:

## Copy Tone Specs

| Scenario | Tone | Example | How not to write |
|---|---|---|---|
| Button |  |  |  |
| Error |  |  |  |
| Empty state |  |  |  |
| Success |  |  |  |
| Helper text |  |  |  |

## Forbidden Rules / Design Red Lines

| Rule | Reason | When to use | How not to use |
|---|---|---|---|
|  |  |  |  |

## Screen Map

| Screen / Tab / Modal | Entry point | Primary action | Required states | Notes |
|---|---|---|---|---|
|  |  |  |  |  |

## Component Inventory

| Component | Screens used on | Token dependencies | Asset dependencies | Frontend notes |
|---|---|---|---|---|
|  |  |  |  |  |

## Asset Manifest

| File | Purpose | Size | Transparent background | Source prompt / source | Screens used on |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Design Tokens

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
module.exports = {
  theme: {
    extend: {
      colors: {},
      fontFamily: {},
      spacing: {},
      borderRadius: {},
      boxShadow: {},
    },
  },
};
```
