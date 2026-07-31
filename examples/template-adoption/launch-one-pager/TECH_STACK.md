# TECH_STACK.md

## Technology route decision

- Decision mode: user-declared route
- Primary route: single static HTML page with a print stylesheet, plus a Markdown-sourced deck
- Rationale: readers forward the link, read offline, and print to PDF, so the output must be a single self-contained file with no build service or runtime dependency.
- Excluded routes: no static site generator, presentation SaaS, or app, because each turns a forwardable file into a service that must be maintained.
- Late-stage risks: the one-pager and the project documents drift apart over time; if speaker notes are mixed into the slides, factual statements become hard to check row by row.
- Re-evaluation triggers: re-evaluate if the one-pager stops being the entry point and a trial environment becomes the primary call to action.
- New technology gate: before introducing any build tool or presentation platform, confirm that offline readability and printability still hold.
- Decision status: active
- Evidence: SRC-501, SRC-502, REQ-501@1, REQ-502@1
- Nearest alternative: static site generator with a slide plugin
- Review trigger: event-only when a trial environment replaces the one-pager as the entry point

## Runtime

| Layer | Choice | Version | Reason | Alternative considered |
|---|---|---|---|---|
| Frontend | Hand-written HTML with an embedded stylesheet | n/a | Single self-contained file, no build step | Static site generator |
| Backend | n/a | n/a | The deliverable is a document, not a service | Content API |
| Database | n/a | n/a | No stored state | Headless CMS |
| Main framework / SDK | n/a | n/a | No framework needed for one page | Slide framework |
| Package manager | Project standard | project pinned | Only used for the Markdown-to-deck export | Alternative registry |
| Deployment | Internal static host plus a downloadable PDF | n/a | Readers open a link or a file | Presentation SaaS |

## External Services

| Service | Purpose | Env vars | Owner |
|---|---|---|---|
| none | n/a | n/a | n/a |

## Version Policy

- Record the source commit of the project documents each export was built from.

## Constraints

- The page must render and print without network access.
- Every factual statement must resolve to a project document; nothing may be asserted only in the deliverable.
