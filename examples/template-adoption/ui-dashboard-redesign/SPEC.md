# SPEC.md

## Scope

- Design-rule extraction from existing screens, plus a rebuild of the dispatch queue, single order, and exception handling screens.

## Non-goals

- No changes to the backend API or data model.
- No dark mode.
- No touch gestures beyond the mobile layout.

## User flows

1. A dispatcher opens the queue and filters pending orders by status.
2. A dispatcher expands a single order and reassigns it or flags an exception.
3. On-duty support takes over from the exception list and records the outcome.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-301@1 | add | must | Every order status renders with the same token set on all three rebuilt screens. | SRC-301 | design-owner-role | n/a |
| REQ-302@1 | add | must | Each rebuilt screen renders a defined loading, empty, and error state. | SRC-302 | operator-role | n/a |
| REQ-303@1 | add | redline | No screen may introduce a color, spacing, or radius value that is absent from the declared token set. | SRC-301 | design-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-301 | REQ-301@1 | Yes if the same status maps to one token set across the three screens; no otherwise. | The same status renders in two different colors. |
| AC-302 | REQ-302@1 | Yes if all three states are reachable and recorded per screen; no otherwise. | A screen has no defined empty or error rendering. |
| AC-303 | REQ-303@1 | Yes if every declared value in the rebuilt screens resolves to a token; no otherwise. | A literal hex value appears outside the token block. |

## Edge cases

- Data density when the queue returns more than two hundred rows at once.
- Someone else changes an order status while the user is still on the page.
- Exception text runs longer than two lines.

## Failure conditions

- The design system is written only in documents and never lands in tokens, so the screens diverge again.
- Third-party component defaults override the tokens without anyone noticing.

## Open questions

- Does tablet landscape need the same data density as desktop?

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved density and breakpoint choices as not-stated rows in `OPEN_LOOPS.md`.
