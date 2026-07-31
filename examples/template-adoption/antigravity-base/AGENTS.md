# AGENTS.md

## Project Rules

- Read START_HERE.md when present.
- Read `.agents/AGENTS.md` for the Antigravity runtime entry point.
- Keep this fixture limited to base governance documents plus the generated runtime adapter.
- Do not hand-edit `.agents/`; regenerate it with `init --agent antigravity`.
- Do not add app source code or external service setup.

## Commands

| Purpose | Command |
|---|---|
| Doctor JSON | `node scripts/doctor.mjs --json examples/template-adoption/antigravity-base` |
| Runtime file smoke | `node scripts/smoke-antigravity.mjs` |

## Verification

- The expected result is `status: ready`.
- Fixture updates must keep expected doctor JSON and the generated adapter in sync.
