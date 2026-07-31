# UI_SPEC.md

## Register

- Positioning: product / app (an internal operations tool, not a marketing page)
- Usage context: dispatchers at a fixed dual-monitor workstation during a peak shift, three to four tabs open at once, scanning rather than reading

## Core Flows

| # | Flow name | Start | End | Key actions |
|---|---|---|---|---|
| 1 | Clear the queue | Open the dispatch queue | Pending row count reaches zero | Filter by status, bulk reassign |
| 2 | Handle a single order | Expand one row from the queue | The order leaves the pending state | Reassign, flag exception, write a handling note |
| 3 | Take over an exception | Support opens the exception list | The exception is closed with an outcome recorded | Claim, record outcome, return to dispatch |

## Core Screens

| Screen | Purpose | Main components | Data density | Notes |
|---|---|---|---|---|
| Dispatch queue | Scan pending orders and act in bulk | Table, status badge, filter bar, bulk action bar | high | At least 25 rows per desktop viewport |
| Single order | Inspect and change one order | Panel, Timeline, Form, confirmation Modal | medium | Opened as a Drawer from the queue |
| Exception handling | Support claims and records outcomes | List, Badge, Textarea, Toast | medium | Shares status tokens with the queue |

## State Coverage

| State | Trigger | Visual treatment | Notes |
|---|---|---|---|
| loading | First load or a filter change | Skeleton rows preserve column widths, no spinner | Avoids layout shift |
| empty | No results after filtering | States the current filter and offers clear-filter | No illustration |
| error | Claim failure | Inline error bar with a retry button, existing rows kept | Does not block the page with a Modal |
| disabled | Unauthorized bulk action | Reduced contrast with a reason tooltip | The button is not hidden |
| focus | Keyboard navigation | 2px focus ring using `--color-primary` | The outline is not removed |
| hover / tap | Pointer enters a row | Background switches to `--color-surface`, text color unchanged | Hover is not applied on touch devices |

## Responsive

| Breakpoint | Layout change | Notes |
|---|---|---|
| mobile (<768px) | Unsupported; shows a switch-to-desktop notice | Explicitly out of scope, see the SPEC non-goals |
| tablet (768-1024px) | The queue becomes single-column card rows, bulk actions collapse into an action menu | The density tradeoff is still LOOP-301 |
| desktop (>1024px) | Full-column queue table, orders open in a right-side Drawer | The primary target device |

## Design Sources

- References: screenshots of the three existing screens — dispatch queue, order detail, exception list (composite samples, not real orders)
- Tools: screenshot review, contrast checking, a token draft file

## Explicitly Unwanted

- Template feel, excessive cards, AI purple-blue gradients, meaningless animation, unreadable icons
