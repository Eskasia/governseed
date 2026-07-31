# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-501 | completed | REQ-501@1 | AC-501 | Resolve every statement in both deliverables against the claim-to-source map. |
| TASK-502 | completed | REQ-502@1 | AC-502 | Run the claim review against the forbidden-claim list. |
| TASK-503 | completed | REQ-503@1 | AC-503 | Render and print the page with the network disabled. |

## Task: Build the claim-to-source map

- Input: PROJECT_BRIEF, SPEC, CONTEXT
- Available tools: document search, claim map draft
- Expected output: a claim-to-source map where every statement maps to one document
- Verification: no row in the map has an empty source
- Out of scope: adding sourceless statements for tone

## Task: One-pager

- Input: claim-to-source map, the offline constraint in TECH_STACK
- Available tools: HTML editing, print preview, offline rendering check
- Expected output: a single self-contained HTML file and its PDF
- Verification: rendering and printing both work with the network disabled, and page breaks do not cut key sections
- Out of scope: introducing external fonts, tracking scripts, or a multi-page structure

## Task: Ten-minute deck

- Input: claim-to-source map, the one-pager
- Available tools: Markdown-to-slides export, a speaker notes file
- Expected output: slides plus separate speaker notes
- Verification: notes are separate from the slides, and every factual statement on every slide is in the claim map
- Out of scope: pasting the notes into the slides, adding unverified adoption numbers

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-501 | AC-501 | REQ-501@1 | check:synthetic-claim-source-resolution | passing | 2026-07-31 |
| EVD-502 | AC-502 | REQ-502@1 | check:synthetic-forbidden-claim-scan | passing | 2026-07-31 |
| EVD-503 | AC-503 | REQ-503@1 | check:synthetic-offline-render-print | passing | 2026-07-31 |
