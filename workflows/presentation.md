# Presentation Workflow

Applies to: presentations, PPT, slide decks, launch pages, product intros, client proposals, research reports, one-pagers, white papers, resumes, portfolios, landing pages.

## Tool Routing

| Need | Tool / skill | Output |
|---|---|---|
| Formal PowerPoint / Google Slides / PPTX | `Presentations` plugin | `.pptx` or Google Slides |
| Mixed document, spreadsheet, and slide output | `paperjsx` | PPTX / DOCX / XLSX / PDF |
| High-quality web deck, horizontal paging, magazine style, Swiss style, launch-event style | `guizang-ppt-skill` | A single HTML slide deck |
| High-quality document layout, one-pager, white paper, resume, portfolio, landing page, markdown slides | `kami` | HTML / PDF / static landing page / slide deck |
| Video-style presentation or motion narrative | HyperFrames / Remotion | MP4 / video composition |

## PRESENTATION_BRIEF Required Fields

- Goal: sales, teaching, launch, fundraising, internal sync, research report.
- Audience: who reads it, how much they know, what they care about most.
- Delivery format: PPTX / Google Slides / HTML deck / PDF / MP4 / static HTML page.
- Style: formal business, product demo, magazine, Swiss, research, instructional.
- Length: 6-12 slides recommended; split into sections beyond 15.
- Content sources: PROJECT_BRIEF, SPEC, CONTEXT, data tables, screenshots, research material.
- Must appear: brand, claim, flow diagram, data, screenshots, CTA.
- Must not appear: unverified numbers, fake customers, over-marketed language, unsourced AI promises.

## Guizang PPT Usage Rules

- GitHub: https://github.com/op7418/guizang-ppt-skill
- Skill name: `guizang-ppt-skill`
- Suited to HTML web decks, not traditional editable `.pptx` files.
- Preferred styles:
  - `e-magazine x e-ink`: content-driven, narrative, brand-forward.
  - `Swiss international`: product launches, data-driven, engineering-forward.
- Must provide a reviewable local HTML path or preview URL.
- When done, use Browser/Chrome to check desktop/mobile, paging, text overflow, image loading, and console errors.

## Kami Usage Rules

- GitHub: https://github.com/tw93/Kami
- Skill name: `kami`
- Suited to turning existing content into a deliverable paper or web artifact: one-pager, white paper, resume/CV, portfolio, letter, equity report, changelog, slide deck, landing page.
- Documents written in Chinese default to Traditional Chinese output; multilingual content needs extra checks on fonts, line breaking, punctuation, and PDF export.
- A landing page is a static HTML prototype or launch page, not a replacement for the real product frontend repo; once the direction is confirmed, return to the real project to implement it.
- Before starting, lock down: language, template, output format, page count or length, how it will be visually accepted, and the verification command.
- Must provide a reviewable local HTML/PDF path or preview URL, and use Browser/Chrome to check desktop/mobile, text overflow, image loading, and console errors.

## Acceptance

- Each slide carries exactly one point.
- The title, image, numbers, and CTA can be scanned in 5 seconds.
- Every figure has a source or is clearly marked as mock.
- The export format matches how it will be used.
- An HTML deck must open offline or explicitly list its external resource dependencies.
