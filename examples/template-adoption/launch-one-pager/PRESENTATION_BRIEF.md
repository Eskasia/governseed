# PRESENTATION_BRIEF.md

## Goal

- Let a technical decision maker who has never heard of this tool judge within three minutes whether it is relevant to them, and know what it explicitly does not do.

## Audience

- Technical decision makers at potential adopters, who receive a forwarded link and read it while commuting or between meetings.
- Internal presenters, who need a ten-minute version that stands on its own without live elaboration.

## Delivery Format

- PPTX / Google Slides / HTML deck / PDF / MP4 / static HTML page: a single self-contained static HTML page plus a printable PDF; the deck is exported from Markdown to an HTML deck, with speaker notes in a separate file.

## Style

- Declarative, no stacked adjectives; state the boundaries before the capabilities.
- No gradients, no illustration, no unverified numbers.

## Length

- One-pager: prints to a single A4 page, about 500 words.
- Deck: ten minutes, no more than twelve slides.

## Content Sources

- `PROJECT_BRIEF.md`: one-line summary, users, problem, explicitly out of scope.
- `SPEC.md`: scope, non-goals, acceptance criteria.
- `CONTEXT.md`: shared vocabulary and role boundaries.
- Every statement is registered in the map below with its source; a statement without a source does not enter the deliverable.

### Claim-to-source Map

| Claim ID | Statement | Source document | Reviewer decision |
|---|---|---|---|
| `CLM-501` | What problem this tool addresses | `PROJECT_BRIEF.md` problem | approved |
| `CLM-502` | Who the intended users are | `PROJECT_BRIEF.md` users | approved |
| `CLM-503` | The three things it explicitly does not do | `SPEC.md` non-goals | approved |
| `CLM-504` | How the acceptance criteria are judged | `SPEC.md` acceptance criteria | approved |
| `CLM-505` | Term definitions and the easily confused ones | `CONTEXT.md` shared vocabulary | approved |

## Must Include

- What the tool explicitly does not do, placed before the capability description.
- Term definitions, so readers do not substitute their own.
- Every factual statement on every slide traceable to the claim map.

## Must Not Include

- Adoption numbers, customer names, outcome claims, or any wording that implies external adoption.
- Statements that exist only in the deliverable and cannot be traced back to a project document.
- External fonts, tracking scripts, or any network dependency.

## Review Method

- An internal reviewer who was not on the project reads only the one-pager and restates the tool's boundaries; an incorrect restatement is a defect.
- Check the claim map row by row; any statement with an empty source is sent back.
- Run the forbidden-claim scan; a hit blocks publication.

## Export / Preview Path

- `exports/onepager-<source-commit>.html` and the PDF of the same name.
- `exports/deck-<source-commit>.html` and `exports/deck-<source-commit>-notes.md`.
- Preview method: open the HTML in a browser with the network disabled, and run one print preview.
