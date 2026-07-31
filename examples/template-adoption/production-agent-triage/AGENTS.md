# AGENTS.md

## Project Rules

- The program decides the order of steps; the model only fills the action schema.
- Any action that writes to production stops at ask_human, with no timeout-based default.

## Commands

| Purpose | Command |
|---|---|
| Replay the golden set | `npm run eval:golden` |
| Run the approval-gate negative test | `npm run test:approval-gate` |
| Seed a synthetic incident history index | `npm run seed:history` |

## Verification

- A change to the prompt template or the model version requires an EVAL_PLAN regression run before merge.
- The approval-gate negative test must fail closed when the approval service is unreachable.

## Do Not

- Do not add a production-writing tool without an `AI_SECURITY_REVIEW.md` row.
- Do not retain raw alert payloads, model stdout, or tool traces in evidence.

## File Ownership

- `AI_SECURITY_REVIEW.md` is owned by the security reviewer; agents propose changes rather than editing it directly.

## Subdirectory Rules

- `eval/` holds the golden set and its seeded synthetic fixtures; no production records enter it.
