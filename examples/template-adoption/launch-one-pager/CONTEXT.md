# CONTEXT.md

## Shared language

| Term | Meaning | Do not confuse with |
|---|---|---|
| Claim | One factual statement in a deliverable | An opinion or a tagline |
| Claim-to-source map | The table linking each claim to a project document | A bibliography |
| One-pager | The single self-contained HTML page | The deck's first slide |
| Speaker notes | The script kept outside the slides | Slide body text |

## Roles

| Role | Goal | Permission / boundary |
|---|---|---|
| Product owner | Decide what the deliverables say | Does not approve claims about external adoption |
| Reviewer | Check every claim against its source | Owns the forbidden-claim list |
| Presenter | Deliver the ten-minute version | Does not add claims outside the map |

## Data objects

| Object | Meaning | Source of truth |
|---|---|---|
| Claim | One statement subject to review | `PRESENTATION_BRIEF.md` claim-to-source map |
| Export | One built page or deck with its source commit | Build record |
| Forbidden-claim list | Statements neither deliverable may make | `SPEC.md` non-goals and REQ-502@1 |

## Existing constraints

- The page must render and print with no network access.
- Nothing may be asserted only in a deliverable; the source document comes first.

## Decisions already made

- Speaker notes stay outside the slides so claims stay reviewable line by line.
- No adoption, customer, or effectiveness claims appear in either deliverable.
