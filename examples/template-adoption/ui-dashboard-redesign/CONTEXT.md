# CONTEXT.md

## Shared language

| Term | Meaning | Do not confuse with |
|---|---|---|
| Token | A named design value the screens resolve at render time | A literal hex or pixel value |
| Status | The dispatch state of an order | The HTTP status of the request that fetched it |
| Exception | An order a dispatcher flagged for handover | A runtime error in the dashboard |
| Density | Rows visible without scrolling at a given breakpoint | Font size |

## Roles

| Role | Goal | Permission / boundary |
|---|---|---|
| Dispatcher | Clear the queue without misreading status | Does not change token values |
| Support duty officer | Take over flagged exceptions | Does not reassign orders |
| Design owner | Own the token set and the design red lines | Does not change backend fields |

## Data objects

| Object | Meaning | Source of truth |
|---|---|---|
| Order | One dispatch record shown in the queue | Existing order service |
| Status token set | The color, weight, and label for one status | `DESIGN_SYSTEM.md` |
| Screen | One rebuilt page with its three states | `UI_SPEC.md` |

## Existing constraints

- The backend API and its field names do not change in this project.
- Screens run inside the existing internal release pipeline.

## Decisions already made

- Extract rules from existing screens before drawing anything new.
- Desktop-first; tablet is supported, phone is out of scope.
