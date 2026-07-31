# OPEN_LOOPS.md

## Open loops ledger

| Status | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |
|---|---|---|---|---|---|---|---|---|
| open | LOOP-301 | not-stated | Should tablet landscape keep desktop row density or drop to the compact table? | medium | design-owner-role | Run the queue screen at 1024px with a seeded two-hundred-row set. | before design review sign-off | n/a |
| open | LOOP-302 | not-stated | Which existing screen wins when two screens disagree on the warning color? | high | design-owner-role | Record the chosen source screen in the visual-language extraction table. | before token freeze | n/a |
| closed | LOOP-303 | not-stated | May the design review use production order records? | high | operator-role | Use seeded synthetic orders only; no customer data enters review evidence. | resolved | SRC-302 |

## Rules

- A screenshot is not a design review; the reviewer must operate the screen.
- Close an item only after the decision is written into `DESIGN_SYSTEM.md` or `DESIGN_REVIEW.md`.
- Re-check this file before freezing the token set.
