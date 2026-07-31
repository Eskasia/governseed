# TASK_CONTRACT.md

## Task coverage ledger

| Task ID | Status | Requirement | AC | Verification |
|---|---|---|---|---|
| TASK-301 | completed | REQ-301@1 | AC-301 | Compare the status token mapping across the three rebuilt screens. |
| TASK-302 | completed | REQ-302@1 | AC-302 | Walk each screen through loading, empty, and error with seeded synthetic data. |
| TASK-303 | completed | REQ-303@1 | AC-303 | Scan the rebuilt screens for literal color, spacing, and radius values. |

## Task: Extract the design system from screenshots

- Input: screenshots of the existing screens, UI_SPEC, DESIGN_SYSTEM
- Available tools: screenshot inspection, contrast checker, token draft file
- Expected output: a filled DESIGN_SYSTEM including the inconsistencies and the red lines
- Verification: every rule names the existing screen it came from and flags where the existing screens contradict each other
- Out of scope: changing the existing screens directly, introducing a new component library

## Task: Rebuild the three core screens

- Input: UI_SPEC, DESIGN_SYSTEM, sample responses from the existing API
- Available tools: the project template engine, the token file, seeded synthetic fixtures
- Expected output: the three screens — dispatch queue, single order, exception handling
- Verification: the token checks for AC-301 and AC-303, plus each of the three states being reachable
- Out of scope: changing the backend API, adding new business fields

## Task: Design review and state coverage

- Input: DESIGN_REVIEW, the three rebuilt screens
- Available tools: desktop and tablet browsers, keyboard navigation, a synthetic dataset
- Expected output: a filled DESIGN_REVIEW including the side-by-side differences and the conclusion
- Verification: every row of the state coverage table has a result, and exactly one conclusion box is checked
- Out of scope: substituting screenshots for real operation, reviewing with real order data

## Acceptance evidence ledger

| Evidence ID | AC | Requirement | Safe evidence locator | Result | Verified at |
|---|---|---|---|---|---|
| EVD-301 | AC-301 | REQ-301@1 | check:synthetic-status-token-parity | passing | 2026-07-31 |
| EVD-302 | AC-302 | REQ-302@1 | check:synthetic-state-coverage-walk | passing | 2026-07-31 |
| EVD-303 | AC-303 | REQ-303@1 | check:synthetic-literal-value-scan | passing | 2026-07-31 |
