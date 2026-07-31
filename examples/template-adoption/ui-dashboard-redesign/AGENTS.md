# AGENTS.md

## Project Rules

- Extract a rule from an existing screen before inventing one.
- Never write a literal color, spacing, or radius value into a screen; add a token instead.

## Commands

| Purpose | Command |
|---|---|
| Serve the dashboard locally | `npm run dev` |
| Seed synthetic queue data | `npm run seed:synthetic` |
| Scan screens for literal values | `npm run lint:tokens` |

## Verification

- A screen counts as done only after loading, empty, and error have each been operated, not screenshotted.
- Token parity across the three screens is checked before design review.

## Do Not

- Do not use production order records in design review evidence.
- Do not add a component library without recording its token conflicts first.

## File Ownership

- The token block in `DESIGN_SYSTEM.md` is owned by the design owner; agents propose changes rather than editing it directly.

## Subdirectory Rules

- `screens/` contains one directory per rebuilt screen, each with its three state fixtures.
