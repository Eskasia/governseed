# AGENTS.md

## Project Rules

- Read START_HERE.md when present.
- Keep this fixture limited to base governance documents.
- Do not add app source code.
- Do not add external service setup.

## Commands

| Purpose | Command |
|---|---|
| Doctor JSON | `node scripts/doctor.mjs --json examples/template-adoption/base-minimal` |

## Verification

- The expected result is `status: ready`.
- Fixture updates must keep expected doctor JSON in sync.
