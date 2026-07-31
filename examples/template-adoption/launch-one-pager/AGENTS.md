# AGENTS.md

## Project Rules

- Every factual statement must exist in a project document before it appears in a deliverable.
- Speaker notes never move into slide bodies.

## Commands

| Purpose | Command |
|---|---|
| Build the one-pager and its PDF | `npm run build:onepager` |
| Export the deck from Markdown | `npm run build:deck` |
| Scan for forbidden claims | `npm run check:claims` |

## Verification

- Render and print the page with the network disabled before every publish.
- The claim scan must pass with zero adoption, customer, or effectiveness statements.

## Do Not

- Do not add external fonts, analytics, or any network dependency to the page.
- Do not state or imply external adoption anywhere in either deliverable.

## File Ownership

- The claim-to-source map in `PRESENTATION_BRIEF.md` is owned by the reviewer; agents propose rows rather than editing approved ones.

## Subdirectory Rules

- `exports/` holds built artifacts, each named with the source commit it was built from.
