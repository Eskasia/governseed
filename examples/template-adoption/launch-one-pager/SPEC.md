# SPEC.md

## Scope

- One self-contained HTML page, a ten-minute deck with separated speaker notes, and a claim-to-source map covering both.

## Non-goals

- No multi-page marketing site.
- No customer stories, adoption numbers, or outcome claims.
- No interactive demo or trial environment.

## User flows

1. A reader receives the link, finishes the one-pager within three minutes, and judges whether it is relevant.
2. A reader prints or saves it as a PDF and forwards it to a colleague.
3. A presenter delivers ten minutes using the same set of factual statements.

## Requirement revision ledger

| Revision | Operation | Class | Normalized requirement | Source | Confirmed by | Supersedes |
|---|---|---|---|---|---|---|
| REQ-501@1 | add | must | Every factual statement in either deliverable maps to a named project document. | SRC-501 | product-owner-role | n/a |
| REQ-502@1 | add | redline | Neither deliverable may state adoption, customer, or effectiveness claims. | SRC-502 | reviewer-role | n/a |
| REQ-503@1 | add | must | The one-pager renders and prints without network access. | SRC-501 | product-owner-role | n/a |

## Acceptance criteria ledger

| AC ID | Requirement revision | Yes/no criterion | Failure signal |
|---|---|---|---|
| AC-501 | REQ-501@1 | Yes if every statement resolves in the claim-to-source map; no otherwise. | A statement has no source document. |
| AC-502 | REQ-502@1 | Yes if the review finds no adoption or effectiveness claim; no otherwise. | A deliverable implies external adoption. |
| AC-503 | REQ-503@1 | Yes if the page renders and prints offline; no otherwise. | The page requires a network fetch to render. |

## Edge cases

- The project documents change after export, leaving the one-pager stale.
- A page break cuts a key section when printing.
- The speaker notes get pasted into the slides, so factual statements cannot be checked row by row.

## Failure conditions

- Writing a statement that cannot be traced back to a document because it reads more forcefully.
- Filling gaps in persuasiveness with unevidenced claims such as "already adopted".

## Open questions

- Is a translated version of the one-pager needed?

## Lineage rules

- Requirement revisions are append-only; replace or withdraw without deleting prior rows.
- Keep unresolved localisation choices as not-stated rows in `OPEN_LOOPS.md`.
