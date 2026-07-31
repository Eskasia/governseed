# OPEN_LOOPS.md

## Open loops ledger

| Status | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |
|---|---|---|---|---|---|---|---|---|
| open |  | not-stated |  | high / medium / low |  |  |  | n/a |

## Blocker labels

- `architecture-blocked`: architecture decision is open
- `auth-blocked`: authentication / permission approach is open
- `data-blocked`: data model or data source is open
- `design-blocked`: UI/UX direction is open
- `env-blocked`: environment, deployment, or secrets are not ready
- `dependency-blocked`: waiting on an external service or team
- `scope-blocked`: requirement scope needs confirmation

## Rules

- Do not treat an open loop as a settled decision.
- Every not-stated item receives an append-only `LOOP` ID and `Basis: not-stated`.
- Every open loop needs an explicit blocker label and a next step; `Owner` uses lowercase `*-role` labels only.
- Free-text cells contain only privacy-safe normalized descriptions: no personal identifier, credential, private URL/query, absolute home path, content hash, or masked excerpt.
- Close a loop only after the decision or evidence is recorded in a project document; closed rows must cite the confirmed resolution `SRC` without copying private content; open/blocked rows keep `Resolution source` as `n/a`.
- Review on a schedule: sweep once at the end of every phase.
